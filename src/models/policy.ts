import { isDeepStrictEqual } from "node:util";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";

export type HostConfig = OpenClawPluginApi["config"];
export interface RuntimeModel {
  id: string;
  name: string;
  isDefault: boolean;
  input: Array<"text" | "image" | "audio" | "video">;
  reasoning: boolean;
}
export interface ModelPolicy {
  enabled: boolean;
  mode: "provider-default" | "pinned";
  model?: string;
  onMissing: "hold" | "provider-default";
  runtimeCommand: string;
  refreshSeconds: number;
  timeoutMs: number;
}

export function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

function modelId(value: unknown): string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,199}$/.test(value)) {
    throw new Error("Invalid model identifier in runtime catalog or policy.");
  }
  return value;
}

export function readModelPolicy(raw?: unknown): ModelPolicy {
  const value = record(raw);
  const mode = value.mode ?? "provider-default";
  const onMissing = value.onMissing ?? "hold";
  if (mode !== "provider-default" && mode !== "pinned") throw new Error("Invalid model policy mode.");
  if (onMissing !== "hold" && onMissing !== "provider-default") throw new Error("Invalid missing-model policy.");
  const model = typeof value.model === "string" ? modelId(value.model.replace(/^openai\//, "")) : undefined;
  if (mode === "pinned" && !model) throw new Error("Pinned policy requires a model identifier.");
  const refreshSeconds = value.refreshSeconds ?? 900;
  const timeoutMs = value.timeoutMs ?? 15000;
  if (typeof refreshSeconds !== "number" || !Number.isInteger(refreshSeconds) || refreshSeconds < 60 || refreshSeconds > 86400) {
    throw new Error("Model refresh interval must be 60–86400 seconds.");
  }
  if (typeof timeoutMs !== "number" || !Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 60000) {
    throw new Error("Model discovery timeout must be 1000–60000 milliseconds.");
  }
  const runtimeCommand = value.runtimeCommand ?? "auto";
  if (typeof runtimeCommand !== "string" || !runtimeCommand.trim()) throw new Error("Invalid runtime command.");
  return { enabled: value.enabled === true, mode, model, onMissing, runtimeCommand,
    refreshSeconds, timeoutMs };
}

/** Parse only required fields; future fields/modalities cannot invalidate known models. */
export function parseModelPage(raw: unknown): { models: RuntimeModel[]; nextCursor?: string } {
  const page = record(raw);
  if (!Array.isArray(page.data)) throw new Error("Runtime returned an invalid model catalog.");
  const models: RuntimeModel[] = [];
  const ids = new Set<string>();
  for (const item of page.data) {
    const value = record(item);
    if (value.hidden === true) continue;
    const id = modelId(value.model ?? value.id);
    if (ids.has(id)) throw new Error("Runtime catalog contains duplicate model identifiers.");
    ids.add(id);
    const input = Array.isArray(value.inputModalities)
      ? [...new Set(value.inputModalities.filter((v): v is RuntimeModel["input"][number] =>
        v === "text" || v === "image" || v === "audio" || v === "video"))] : ["text" as const];
    if (!input.includes("text")) continue;
    const reasoning = Array.isArray(value.supportedReasoningEfforts) && value.supportedReasoningEfforts.some(
      effort => typeof record(effort).reasoningEffort === "string" && !["none", "off"].includes(String(record(effort).reasoningEffort)));
    models.push({ id, name: typeof value.displayName === "string" ? value.displayName.slice(0, 200) : id,
      isDefault: value.isDefault === true, input, reasoning });
  }
  if (page.nextCursor != null && (typeof page.nextCursor !== "string" || !page.nextCursor)) {
    throw new Error("Invalid runtime catalog pagination cursor.");
  }
  return { models, ...(typeof page.nextCursor === "string" ? { nextCursor: page.nextCursor } : {}) };
}

export function selectModel(models: RuntimeModel[], policy: ModelPolicy): { model: RuntimeModel; reason: string } {
  if (policy.mode === "pinned") {
    const pinned = models.find(model => model.id === policy.model);
    if (pinned) return { model: pinned, reason: "pinned" };
    if (policy.onMissing === "hold") throw new Error("Pinned model is unavailable; holding configuration.");
  }
  const defaults = models.filter(model => model.isDefault);
  if (defaults.length !== 1) throw new Error("Runtime catalog must identify exactly one visible text model as default.");
  return { model: defaults[0], reason: policy.mode === "pinned" ? "pinned-model-unavailable" : "provider-default" };
}

export function policyFromConfig(config: HostConfig): ModelPolicy {
  return readModelPolicy(record(config.plugins?.entries?.["aegis-governance"]?.config).modelPolicy);
}

/** Local discovery is supported only when actual execution uses the same protocol. */
export function validateRuntimeOptions(config: HostConfig): void {
  const appServer = record(record(config.plugins?.entries?.codex?.config).appServer);
  if ((appServer.transport && appServer.transport !== "stdio") || appServer.url || appServer.headers || appServer.authToken) {
    throw new Error("Custom/remote Codex transport is not supported by local model discovery.");
  }
  if (appServer.args !== undefined && !isDeepStrictEqual(appServer.args, ["app-server"]) && appServer.args !== "app-server") {
    throw new Error("Custom Codex app-server arguments require matching discovery support.");
  }
  if (Array.isArray(appServer.clearEnv) && appServer.clearEnv.length) {
    throw new Error("Custom Codex environment clearing requires matching discovery support.");
  }
}

/** A pure, focused update: never replace whole provider/plugin/agent maps. */
export function planModelUpdate(config: HostConfig, policy: ModelPolicy, models: RuntimeModel[], command: string) {
  validateRuntimeOptions(config);
  const { model: selected, reason } = selectModel(models, policy);
  if (config.plugins?.entries?.codex?.enabled !== true) throw new Error("Codex runtime plugin must already be enabled.");
  const provider = config.models?.providers?.openai;
  if (provider?.baseUrl) {
    let official = false;
    try { const url = new URL(provider.baseUrl); official = url.protocol === "https:" && url.hostname === "api.openai.com" && /^\/(v1\/?)?$/.test(url.pathname); } catch {}
    if (!official) throw new Error("Existing custom OpenAI transport requires an explicit migration.");
  }
  if (provider?.apiKey || provider?.auth === "api-key" || (provider?.agentRuntime?.id && provider.agentRuntime.id !== "codex")) {
    throw new Error("Existing custom OpenAI authentication/runtime requires an explicit migration.");
  }
  const selectedRef = `openai/${selected.id}`;
  const previousModel = typeof config.agents?.defaults?.model === "string"
    ? config.agents.defaults.model : config.agents?.defaults?.model?.primary;
  const configuredRuntime = config.agents?.defaults?.models?.[selectedRef]?.agentRuntime?.id;
  if (configuredRuntime && configuredRuntime !== "codex") throw new Error("Selected model has a conflicting runtime policy.");
  const nextConfig = structuredClone(config);
  nextConfig.models ??= {};
  nextConfig.models.providers ??= {};
  const nextProvider = nextConfig.models.providers.openai ?? { models: [] };
  const rows = [...(nextProvider.models ?? [])];
  for (const model of models) {
    const index = rows.findIndex(row => row.id === model.id);
    const existing = index < 0 ? undefined : rows[index];
    if (existing?.baseUrl || existing?.api) {
      if (model.id === selected.id) throw new Error("Selected provider model has a custom transport; explicit migration required.");
      continue;
    }
    if (existing?.agentRuntime?.id && existing.agentRuntime.id !== "codex") {
      if (model.id === selected.id) throw new Error("Selected provider model has a conflicting runtime policy.");
      continue;
    }
    // The SDK's normalized config type requires budgeting fields that model/list
    // does not supply. Retain configured budgets, otherwise use conservative
    // host compatibility defaults; these are not discovered capacity/pricing.
    const row = { cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 200000, maxTokens: 8192,
      ...existing, id: model.id, name: model.name, input: model.input, reasoning: model.reasoning,
      agentRuntime: { id: "codex" } };
    if (index < 0) rows.push(row); else rows[index] = row;
  }
  nextProvider.models = rows;
  nextConfig.models.providers.openai = nextProvider;
  nextConfig.agents ??= {};
  nextConfig.agents.defaults ??= {};
  const defaults = nextConfig.agents.defaults;
  defaults.models ??= {};
  defaults.models[selectedRef] = { ...defaults.models[selectedRef], agentRuntime: { id: "codex" } };
  defaults.model = { ...(typeof defaults.model === "object" ? defaults.model : {}), primary: selectedRef };
  nextConfig.plugins ??= {};
  nextConfig.plugins.entries ??= {};
  const codex = nextConfig.plugins.entries.codex ??= {};
  const codexConfig = record(codex.config);
  codex.config = { ...codexConfig, appServer: { ...record(codexConfig.appServer), command } };
  return { nextConfig, changed: !isDeepStrictEqual(config, nextConfig), selected, previousModel, reason };
}
