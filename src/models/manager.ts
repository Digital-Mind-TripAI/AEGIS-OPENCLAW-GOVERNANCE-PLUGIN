import { randomUUID } from "node:crypto";
import { appendFileSync, closeSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import { discoverModels, resolveRuntimeCommand } from "./discovery.js";
import { planModelUpdate, policyFromConfig, record, validateRuntimeOptions, type HostConfig, type ModelPolicy, type RuntimeModel } from "./policy.js";

interface ModelStatus {
  updatedAt?: string;
  lastSuccessfulRefresh?: string;
  selected?: string;
  runtimeCommand?: string;
  runtimeVersion?: string;
  policy?: ModelPolicy;
  models?: RuntimeModel[];
  lastError?: string;
}
interface Dependencies {
  stateDir?: string;
  discover?: typeof discoverModels;
  resolveCommand?: typeof resolveRuntimeCommand;
}

function errorCode(error: unknown) { return record(error).code; }
class NoConfigurationChange extends Error {}

/** Serialize Gateway/manual refreshes; a separate recovery lock prevents stale-owner races. */
function acquireLock(directory: string): () => void {
  const path = join(directory, "refresh.lock");
  const value = JSON.stringify({ pid: process.pid, nonce: randomUUID() });
  const own = () => {
    const fd = openSync(path, "wx");
    try { writeFileSync(fd, value); } finally { closeSync(fd); }
    return () => { try { if (readFileSync(path, "utf8") === value) unlinkSync(path); } catch {} };
  };
  try { return own(); } catch (error) { if (errorCode(error) !== "EEXIST") throw error; }
  const alive = (pid: unknown) => {
    if (!Number.isInteger(pid) || Number(pid) < 1) return true;
    try { process.kill(Number(pid), 0); return true; } catch (error) { return errorCode(error) !== "ESRCH"; }
  };
  const owner = () => record(JSON.parse(readFileSync(path, "utf8"))).pid;
  if (alive(owner())) throw new Error("Another model refresh is already running.");
  const recoveryPath = join(directory, "recovery.lock");
  let recovery: number;
  try { recovery = openSync(recoveryPath, "wx"); }
  catch { throw new Error("Model refresh lock recovery is already running; retry later."); }
  try {
    try { if (!alive(owner())) unlinkSync(path); } catch (error) { if (errorCode(error) !== "ENOENT") throw error; }
    return own();
  } finally { closeSync(recovery); unlinkSync(recoveryPath); }
}

export function createModelManager(api: OpenClawPluginApi, dependencies: Dependencies = {}) {
  const directory = join(dependencies.stateDir ?? api.runtime.state.resolveStateDir(), "aegis-model-policy");
  const statePath = join(directory, "status.json");
  const historyPath = join(directory, "history.jsonl");
  const discover = dependencies.discover ?? discoverModels;
  const resolveCommand = dependencies.resolveCommand ?? resolveRuntimeCommand;
  let active = true;
  let controller: AbortController | undefined;
  let inFlight: Promise<ModelStatus> | undefined;
  let interval: ReturnType<typeof setInterval> | undefined;
  const current = () => structuredClone(api.runtime.config.current()) as HostConfig;
  const readState = (): ModelStatus => {
    try { return record(JSON.parse(readFileSync(statePath, "utf8"))) as ModelStatus; }
    catch (error) { if (errorCode(error) !== "ENOENT") api.logger.warn("[aegis-models] Status cache unreadable; using live config."); return {}; }
  };
  const persist = (state: ModelStatus) => {
    const temporary = join(directory, `status-${process.pid}-${randomUUID()}.tmp`);
    try { writeFileSync(temporary, JSON.stringify(state, null, 2), { mode: 0o600 }); renameSync(temporary, statePath); }
    finally { try { unlinkSync(temporary); } catch {} }
  };
  const append = (event: Record<string, unknown>) => appendFileSync(historyPath,
    JSON.stringify({ timestamp: new Date().toISOString(), ...event }) + "\n", { mode: 0o600 });

  async function run(): Promise<ModelStatus> {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const release = acquireLock(directory);
    controller = new AbortController();
    let stage = "discovery";
    try {
      const initial = current();
      const policy = policyFromConfig(initial);
      if (!active || !policy.enabled || initial.plugins?.entries?.["aegis-governance"]?.enabled === false) {
        throw new Error("Model policy is disabled or manager stopped.");
      }
      validateRuntimeOptions(initial);
      if (process.env.OPENCLAW_CODEX_APP_SERVER_ARGS) throw new Error("Custom runtime environment arguments are not supported by discovery.");
      const configured = record(record(initial.plugins?.entries?.codex?.config).appServer).command;
      const command = await resolveCommand(policy.runtimeCommand, typeof configured === "string" ? configured : undefined);
      const agentId = initial.agents?.list?.find(agent => agent.default)?.id ?? initial.agents?.list?.[0]?.id ?? "main";
      const agentDir = api.runtime.agent.resolveAgentDir(initial, agentId);
      const codexHome = join(agentDir, "codex-home");
      mkdirSync(codexHome, { recursive: true, mode: 0o700 });
      const catalog = await discover(command, { timeoutMs: policy.timeoutMs, signal: controller.signal,
        env: { ...process.env, CODEX_HOME: codexHome } });
      const ensureCurrent = (config: HostConfig) => {
        if (!active || controller?.signal.aborted) throw new Error("Model manager stopped; refresh cancelled.");
        if (!isDeepStrictEqual(policyFromConfig(config), policy) || config.plugins?.entries?.["aegis-governance"]?.enabled === false) {
          throw new Error("Model policy changed or disabled during discovery; refresh discarded.");
        }
      };
      const latest = current(); ensureCurrent(latest);
      const plan = planModelUpdate(latest, policy, catalog.models, command);
      let applied = false;
      if (plan.changed) {
        stage = "configuration";
        append({ type: "selection-proposed", previous: plan.previousModel, selected: `openai/${plan.selected.id}`,
          reason: plan.reason, runtimeCommand: command });
        try {
          const result = await api.runtime.config.mutateConfigFile<boolean>({
          base: "source", afterWrite: { mode: "auto" },
          mutate: draft => {
            ensureCurrent(draft);
            const update = planModelUpdate(draft, policy, catalog.models, command);
            // Source snapshots omit normalized defaults; compare within the same shape.
            if (!update.changed) throw new NoConfigurationChange();
            draft.agents = update.nextConfig.agents;
            draft.models = update.nextConfig.models;
            draft.plugins = update.nextConfig.plugins;
            return true;
          }
          });
          applied = result.result === true;
        } catch (error) {
          if (!(error instanceof NoConfigurationChange)) throw error;
          append({ type: "selection-unchanged", selected: `openai/${plan.selected.id}`, reason: "source-already-current" });
        }
        if (applied) {
          append({ type: "selection-applied", previous: plan.previousModel, selected: `openai/${plan.selected.id}`,
            reason: plan.reason, runtimeCommand: command });
          api.logger.info(`[aegis-models] ${plan.previousModel ?? "unset"} → openai/${plan.selected.id} (${plan.reason}); runtime ${command}`);
        }
      }
      const timestamp = new Date().toISOString();
      const state: ModelStatus = { updatedAt: timestamp, lastSuccessfulRefresh: timestamp,
        selected: `openai/${plan.selected.id}`, runtimeCommand: command, runtimeVersion: catalog.runtimeVersion,
        policy, models: catalog.models };
      stage = "status"; persist(state);
      return state;
    } catch (error) {
      const message = stage === "configuration" ? "Host rejected model configuration update; inspect local diagnostics."
        : error instanceof Error ? error.message : "Model refresh failed.";
      const state = { ...readState(), updatedAt: new Date().toISOString(), lastError: message };
      try { persist(state); append({ type: "refresh-failed", stage, message }); } catch {}
      api.logger.warn(`[aegis-models] ${message}`);
      throw error;
    } finally { controller = undefined; release(); }
  }

  function refresh(): Promise<ModelStatus> {
    if (!inFlight) inFlight = run().finally(() => { inFlight = undefined; });
    return inFlight;
  }
  return {
    refresh,
    status: async () => ({ ...readState(), currentPolicy: policyFromConfig(current()), refreshing: Boolean(inFlight) }),
    start() {
      active = true;
      const policy = policyFromConfig(current());
      void refresh().catch(() => {});
      interval = setInterval(() => { void refresh().catch(() => {}); }, policy.refreshSeconds * 1000);
      interval.unref();
    },
    stop() { active = false; controller?.abort(); if (interval) clearInterval(interval); interval = undefined; }
  };
}

export function registerAdaptiveModels(api: OpenClawPluginApi) {
  let manager: ReturnType<typeof createModelManager> | undefined;
  const getManager = (stateDir?: string) => manager ??= createModelManager(api, { stateDir });
  api.registerCli(({ program }) => {
    const root = program.command("aegis-models").description("Inspect and refresh the opt-in AEGIS runtime model policy");
    root.command("status").description("Show selected model, catalog, policy and latest error").action(async () => {
      console.log(JSON.stringify(await getManager().status(), null, 2));
    });
    root.command("refresh").description("Refresh the enabled model policy from the configured runtime").action(async () => {
      console.log(JSON.stringify(await getManager().refresh(), null, 2));
    });
  }, { commands: ["aegis-models"], descriptors: [{ name: "aegis-models", description: "AEGIS dynamic model policy", hasSubcommands: true }] });
  if (policyFromConfig(api.config).enabled) {
    api.registerService({ id: "aegis-model-policy", start: ctx => { getManager(ctx.stateDir).start(); },
      stop: () => { manager?.stop(); } });
  }
}
