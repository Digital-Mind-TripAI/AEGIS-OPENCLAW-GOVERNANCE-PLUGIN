import { execFile, spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { isAbsolute, join } from "node:path";
import { promisify } from "node:util";
import { parseModelPage, record, type RuntimeModel } from "./policy.js";

const execute = promisify(execFile);

/** Resolve installed software only. Never install packages or use a versioned path constant. */
export async function resolveRuntimeCommand(preference: string, configured?: string): Promise<string> {
  const check = async (path: string) => {
    if (!isAbsolute(path)) throw new Error("An explicit runtime command must be an absolute executable path.");
    if (process.platform === "win32" && !path.toLowerCase().endsWith(".exe")) {
      throw new Error("The Windows runtime must be a native .exe, not a shell shim.");
    }
    await access(path, constants.X_OK);
    return path;
  };
  if (preference !== "auto") return check(preference);
  if (process.platform === "win32") {
    try {
      const shell = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
      const { stdout } = await execute(shell, ["-NoProfile", "-NonInteractive", "-Command",
        "Get-AppxPackage -Name OpenAI.Codex | Select-Object InstallLocation,Version | ConvertTo-Json -Compress"],
      { windowsHide: true, timeout: 10000, maxBuffer: 1024 * 1024 });
      const raw: unknown = JSON.parse(stdout);
      const entries = (Array.isArray(raw) ? raw : [raw]).map(record)
        .sort((a, b) => String(b.Version).localeCompare(String(a.Version), undefined, { numeric: true }));
      for (const entry of entries) {
        if (typeof entry.InstallLocation === "string") {
          try { return await check(join(entry.InstallLocation, "app", "resources", "codex.exe")); } catch {}
        }
      }
    } catch { /* An explicitly configured native runtime remains usable without a desktop package. */ }
  } else if (process.platform === "darwin") {
    try { return await check("/Applications/Codex.app/Contents/Resources/codex"); } catch {}
  }
  if (configured && isAbsolute(configured)) {
    try { return await check(configured); } catch {}
  }
  if (process.platform !== "win32") {
    try {
      const { stdout } = await execute("/usr/bin/which", ["codex"], { timeout: 5000, maxBuffer: 16384 });
      return await check(stdout.trim());
    } catch {}
  }
  throw new Error("No installed native Codex runtime found; configure modelPolicy.runtimeCommand explicitly.");
}

export interface DiscoveryOptions {
  timeoutMs: number;
  signal?: AbortSignal;
  env?: NodeJS.ProcessEnv;
  /** Internal/test seam. Production always uses the app-server protocol. */
  args?: string[];
}

/** Bounded read-only app-server protocol. Never handles auth or executes requested tools. */
export async function discoverModels(command: string, options: DiscoveryOptions) {
  if (options.signal?.aborted) throw new Error("Model discovery cancelled.");
  const child = spawn(command, options.args ?? ["app-server"], {
    stdio: ["pipe", "pipe", "pipe"], windowsHide: true, shell: false,
    env: options.env ?? process.env
  });
  child.stdout.setEncoding("utf8");
  // Drain stderr without logging it: runtime diagnostics may contain account information.
  child.stderr.resume();
  const closed = new Promise<void>(resolve => child.once("close", () => resolve()));
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  let failure: Error | undefined;
  let sequence = 0;
  let buffer = "";
  let bytes = 0;
  const fail = (error: Error) => {
    failure ??= error;
    for (const request of pending.values()) request.reject(failure);
    pending.clear();
    child.kill();
  };
  child.on("error", () => fail(new Error("Unable to start selected runtime for model discovery.")));
  child.stdin.on("error", () => fail(new Error("Runtime model discovery pipe closed.")));
  child.on("exit", () => {
    if (pending.size) fail(new Error("Runtime exited before model discovery completed."));
  });
  const write = (value: unknown) => child.stdin.write(JSON.stringify(value) + "\n");
  child.stdout.on("data", (chunk: string) => {
    bytes += Buffer.byteLength(chunk);
    if (bytes > 4 * 1024 * 1024) { fail(new Error("Runtime catalog exceeded discovery size limit.")); return; }
    buffer += chunk;
    let end: number;
    while ((end = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, end).trim(); buffer = buffer.slice(end + 1);
      if (!line) continue;
      let message: Record<string, unknown>;
      try { message = record(JSON.parse(line)); }
      catch { fail(new Error("Runtime emitted invalid JSON during model discovery.")); return; }
      if (typeof message.method === "string") {
        if (message.id != null) write({ id: message.id, error: { code: -32601, message: "Read-only model discovery does not accept runtime requests." } });
        continue;
      }
      if (typeof message.id !== "number") continue;
      const request = pending.get(message.id);
      if (!request) continue;
      pending.delete(message.id);
      if (message.error) request.reject(new Error("Runtime rejected a model discovery request."));
      else request.resolve(message.result);
    }
  });
  const request = (method: string, params: unknown) => new Promise<unknown>((resolve, reject) => {
    if (failure) { reject(failure); return; }
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    write({ id, method, params });
  });
  const cancel = () => fail(new Error("Model discovery cancelled."));
  options.signal?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(() => fail(new Error("Runtime model discovery timed out.")), options.timeoutMs);
  try {
    const initialized = record(await request("initialize", {
      clientInfo: { name: "aegis-openclaw-model-policy", title: "AEGIS model discovery", version: "1.0.0" },
      capabilities: { experimentalApi: true }
    }));
    write({ method: "initialized", params: {} });
    const models: RuntimeModel[] = [];
    const ids = new Set<string>();
    const cursors = new Set<string>();
    let cursor: string | undefined;
    for (let index = 0; index < 20; index++) {
      const page = parseModelPage(await request("model/list", { limit: 100, cursor: cursor ?? null, includeHidden: false }));
      for (const model of page.models) {
        if (ids.has(model.id)) throw new Error("Runtime catalog contains duplicate models across pages.");
        ids.add(model.id); models.push(model);
      }
      if (!page.nextCursor) {
        if (!models.length) throw new Error("Runtime returned an empty model catalog.");
        return { models, runtimeVersion: typeof initialized.userAgent === "string" ? initialized.userAgent : "unknown" };
      }
      if (cursors.has(page.nextCursor)) throw new Error("Runtime catalog pagination loop detected.");
      cursors.add(page.nextCursor); cursor = page.nextCursor;
    }
    throw new Error("Runtime catalog pagination exceeded discovery limit.");
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", cancel);
    child.stdin.end();
    child.kill();
    const force = setTimeout(() => { child.kill("SIGKILL"); }, 500);
    let deadline: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([closed, new Promise<never>((_resolve, reject) => {
        deadline = setTimeout(() => reject(new Error("Runtime discovery cleanup timed out.")), 2000);
      })]);
    } finally {
      clearTimeout(force); if (deadline) clearTimeout(deadline);
      child.stdin.destroy(); child.stdout.destroy(); child.stderr.destroy(); child.unref();
    }
  }
}
