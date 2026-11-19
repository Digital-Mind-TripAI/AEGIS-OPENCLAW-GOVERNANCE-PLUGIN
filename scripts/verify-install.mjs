import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, lstatSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const project = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sdkEntry = fileURLToPath(import.meta.resolve("openclaw/plugin-sdk/plugin-entry"));
const cli = resolve(dirname(sdkEntry), "..", "..", "openclaw.mjs");
const scratch = process.platform === "win32" && process.env.LOCALAPPDATA
  ? join(process.env.LOCALAPPDATA, "Temp") : tmpdir();
mkdirSync(scratch, { recursive: true });
const root = mkdtempSync(join(scratch, "aegis-install-check-"));
const records = [];

function run(args, env, cwd = project) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, args, { env, cwd, windowsHide: true });
    let stdout = "", stderr = "";
    const timeout = setTimeout(() => { child.kill(); reject(new Error("Installation check command timed out")); }, 60_000);
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.on("error", error => { clearTimeout(timeout); reject(error); });
    child.on("close", code => {
      clearTimeout(timeout);
      if (code !== 0) reject(new Error(`Installation check failed (${code}): ${stderr || stdout}`));
      else resolveRun(stdout);
    });
  });
}

try {
  assert.ok(process.env.npm_execpath, "Run through npm run verify:install");
  const packed = JSON.parse(await run([process.env.npm_execpath, "pack", "--ignore-scripts", "--json", "--pack-destination", root], process.env));
  const archive = join(root, packed[0].filename);
  for (let iteration = 1; iteration <= 3; iteration++) {
    const profile = join(root, `profile-${iteration}`), state = join(profile, "state");
    mkdirSync(state, { recursive: true });
    mkdirSync(join(profile, "home"));
    const env = { ...process.env, OPENCLAW_HOME: join(profile, "home"), OPENCLAW_STATE_DIR: state,
      OPENCLAW_CONFIG_PATH: join(state, "openclaw.json") };
    // No existing account/provider or Gateway connection is needed for loading.
    for (const key of Object.keys(env)) if (/^(?:OPENAI|ANTHROPIC|GEMINI|GOOGLE_API|OPENROUTER|CODEX_HOME|OPENCLAW_GATEWAY_TOKEN)/.test(key)) delete env[key];
    writeFileSync(env.OPENCLAW_CONFIG_PATH, "{}");
    await run([cli, "plugins", "install", archive], env);
    const pluginRoot = join(state, "extensions", "aegis-governance");
    for (const file of ["package.json", "openclaw.plugin.json", "dist/index.js"]) {
      const stat = lstatSync(join(pluginRoot, file));
      assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1,
        `${file} must be an independent regular file; use nonsynchronized local runtime storage`);
    }
    const config = JSON.parse(readFileSync(env.OPENCLAW_CONFIG_PATH, "utf8"));
    assert.ok(!config.plugins.load?.paths?.length, "Archive install must discover without a manual load path");
    config.plugins.entries["aegis-governance"].hooks = { allowConversationAccess: true };
    config.plugins.entries["aegis-governance"].config = { bookshelfPath: join(profile, "bookshelf.jsonl") };
    writeFileSync(env.OPENCLAW_CONFIG_PATH, JSON.stringify(config, null, 2));
    const inspect = JSON.parse(await run([cli, "plugins", "inspect", "aegis-governance", "--runtime", "--json"], env));
    assert.equal(inspect.plugin.status, "loaded");
    assert.equal(inspect.plugin.version, packed[0].version);
    assert.equal(inspect.diagnostics.length, 0);
    assert.deepEqual(inspect.typedHooks.map(hook => hook.name).sort(),
      ["agent_turn_prepare", "before_agent_reply", "before_agent_run", "before_tool_call", "gateway_stop"]);
    records.push({ iteration, version: inspect.plugin.version, status: inspect.plugin.status,
      hookCount: inspect.typedHooks.length, diagnostics: inspect.diagnostics, manualLoadPath: false, retries: 0 });
    console.log(`Fresh install ${iteration}/3: loaded all five hooks immediately, no retries or manual load path.`);
  }
} finally {
  writeFileSync(join(root, "verification.json"), JSON.stringify({ root, records }, null, 2));
  console.log(`Installation evidence: ${join(root, "verification.json")}`);
}
