import assert from "node:assert/strict";
import test from "node:test";
import { parseModelPage, readModelPolicy, selectModel, planModelUpdate } from "../dist/models/policy.js";

const page = (id, isDefault = true) => ({ data: [{ id, model: id, displayName: id, isDefault,
  inputModalities: ["text", "audio", "future-modality"], supportedReasoningEfforts: [{ reasoningEffort: "low" }], futureField: {} }] });
const models = parseModelPage(page("future-v9")).models;
const policy = readModelPolicy({ enabled: true });
const config = () => ({ agents: { defaults: { model: { primary: "openai/old", fallbacks: ["other/backup"] },
  models: { "openai/old": {}, "other/backup": { alias: "backup" } }, workspace: "/workspace" } },
  tools: { profile: "coding" }, plugins: { entries: { codex: { enabled: true, config: { computerUse: { enabled: false } } },
  "aegis-governance": { enabled: true, hooks: { allowConversationAccess: true } } } } });

test("future catalog fields/modalities are tolerated; hidden, malformed and ambiguous choices are rejected", () => {
  assert.deepEqual(models[0].input, ["text", "audio"]);
  assert.equal(models[0].reasoning, true);
  assert.equal(selectModel(models, policy).model.id, "future-v9");
  assert.throws(() => parseModelPage({ data: [{ id: "__proto__" }] }), /model/i);
  assert.throws(() => parseModelPage({ data: "invalid" }), /catalog/i);
  assert.throws(() => selectModel(parseModelPage({ data: [{ ...page("hidden").data[0], hidden: true }] }).models, policy), /default/i);
  assert.throws(() => selectModel([...models, ...parseModelPage(page("another-default")).models], policy), /default/i);
});

test("pins are retained and retirement obeys hold or provider-default policy", () => {
  const pin = readModelPolicy({ enabled: true, mode: "pinned", model: "openai/pin" });
  const both = [...models, ...parseModelPage(page("pin", false)).models];
  assert.equal(selectModel(both, pin).model.id, "pin");
  assert.throws(() => selectModel(models, pin), /unavailable/i);
  const fallback = readModelPolicy({ enabled: true, mode: "pinned", model: "pin", onMissing: "provider-default" });
  assert.equal(selectModel(models, fallback).reason, "pinned-model-unavailable");
  assert.throws(() => readModelPolicy({ mode: "latest-by-name" }), /mode/i);
});

test("focused update follows changing provider default, preserves user settings, and is idempotent", () => {
  const original = config();
  const copy = structuredClone(original);
  const update = planModelUpdate(original, policy, models, "/trusted/codex");
  assert.deepEqual(original, copy);
  assert.equal(update.nextConfig.agents.defaults.model.primary, "openai/future-v9");
  assert.deepEqual(update.nextConfig.agents.defaults.model.fallbacks, ["other/backup"]);
  assert.deepEqual(update.nextConfig.tools, original.tools);
  assert.deepEqual(update.nextConfig.plugins.entries["aegis-governance"], original.plugins.entries["aegis-governance"]);
  assert.equal(update.nextConfig.plugins.entries.codex.config.computerUse.enabled, false);
  assert.equal(update.nextConfig.plugins.entries.codex.config.appServer.command, "/trusted/codex");
  assert.equal(update.nextConfig.models.providers.openai.models[0].agentRuntime.id, "codex");
  assert.equal(planModelUpdate(update.nextConfig, policy, models, "/trusted/codex").changed, false);
  const nextModels = parseModelPage(page("future-v10")).models;
  assert.equal(planModelUpdate(update.nextConfig, policy, nextModels, "/trusted/codex").selected.id, "future-v10");
});

test("existing custom provider routes, conflicting selected runtime and disabled Codex are not overwritten", () => {
  const custom = config();
  custom.models = { providers: { openai: { baseUrl: "https://private.example/v1", models: [] } } };
  assert.throws(() => planModelUpdate(custom, policy, models, "/trusted/codex"), /custom/i);
  const disabled = config(); disabled.plugins.entries.codex.enabled = false;
  assert.throws(() => planModelUpdate(disabled, policy, models, "/trusted/codex"), /enabled/i);
  const conflict = config(); conflict.agents.defaults.models["openai/future-v9"] = { agentRuntime: { id: "other" } };
  assert.throws(() => planModelUpdate(conflict, policy, models, "/trusted/codex"), /runtime/i);
});

test("per-model custom transports remain untouched and cannot be selected implicitly", () => {
  const input = config();
  const customRow = { id: "custom-alternative", name: "Private", baseUrl: "https://private.example/v1", api: "openai-responses" };
  input.models = { providers: { openai: { models: [customRow] } } };
  const all = [...models, ...parseModelPage(page("custom-alternative", false)).models];
  const result = planModelUpdate(input, policy, all, "/trusted/codex");
  assert.deepEqual(result.nextConfig.models.providers.openai.models.find(row => row.id === customRow.id), customRow);
  const pin = readModelPolicy({ enabled: true, mode: "pinned", model: customRow.id });
  assert.throws(() => planModelUpdate(input, pin, all, "/trusted/codex"), /custom|transport/i);
});

test("remote or customized app-server transports cannot be replaced by local discovery", () => {
  for (const appServer of [{ transport: "websocket", url: "ws://remote.example" },
    { args: ["app-server", "--config", "alternate"] }, { clearEnv: ["CODEX_HOME"] }]) {
    const input = config(); input.plugins.entries.codex.config.appServer = appServer;
    assert.throws(() => planModelUpdate(input, policy, models, "/trusted/codex"), /transport|arguments|environment/i);
  }
});
