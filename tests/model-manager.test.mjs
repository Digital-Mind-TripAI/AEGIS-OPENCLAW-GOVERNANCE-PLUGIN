import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createModelManager } from "../dist/models/manager.js";

const catalog = { models: [{ id: "future-default", name: "Future", isDefault: true, input: ["text"], reasoning: true }], runtimeVersion: "future-runtime" };
function setup(t, discover = async () => catalog) {
  const stateDir = mkdtempSync(join(tmpdir(), "aegis-manager-"));
  t.after(() => rmSync(stateDir, { recursive: true, force: true }));
  let config = { agents: { defaults: { model: { primary: "openai/old" } } }, plugins: { entries: {
    codex: { enabled: true }, "aegis-governance": { enabled: true, config: { modelPolicy: { enabled: true } } }
  } } };
  let writes = 0;
  let stale;
  const api = { logger: { info() {}, warn() {}, error() {} }, runtime: { agent: {
    resolveAgentDir: () => join(stateDir, "agent")
  }, config: {
    current: () => structuredClone(stale ?? config),
    mutateConfigFile: async ({ mutate, afterWrite, base }) => {
      assert.equal(afterWrite.mode, "auto"); assert.equal(base, "source");
      const draft = structuredClone(config); const result = await mutate(draft, {});
      config = draft; writes++; return { result };
    }
  } } };
  const manager = createModelManager(api, { stateDir, discover, resolveCommand: async () => "/trusted/codex" });
  return { manager, stateDir, get config() { return config; }, get writes() { return writes; },
    edit: fn => fn(config), stale: value => { stale = value; } };
}

test("manager applies focused changes once, records history, and avoids reload loops", async (t) => {
  const s = setup(t);
  const first = await s.manager.refresh();
  assert.equal(first.selected, "openai/future-default");
  assert.equal(s.writes, 1);
  await s.manager.refresh();
  assert.equal(s.writes, 1);
  const history = readFileSync(join(s.stateDir, "aegis-model-policy", "history.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
  assert.deepEqual(history.map(event => event.type), ["selection-proposed", "selection-applied"]);
});

test("failed discovery retains selected configuration and exposes the error", async (t) => {
  const s = setup(t, async () => { throw new Error("Runtime model discovery timed out."); });
  await assert.rejects(s.manager.refresh(), /timed out/i);
  assert.equal(s.writes, 0);
  assert.equal(s.config.agents.defaults.model.primary, "openai/old");
  assert.match((await s.manager.status()).lastError, /timed out/i);
});

test("refresh is single-flight and stop cancels before configuration can be written", async (t) => {
  let finish;
  const s = setup(t, () => new Promise(resolve => { finish = resolve; }));
  const first = s.manager.refresh();
  assert.equal(s.manager.refresh(), first);
  while (!finish) await new Promise(resolve => setImmediate(resolve));
  s.manager.stop(); finish(catalog);
  await assert.rejects(first, /stopped|cancel/i);
  assert.equal(s.writes, 0);
});

test("user edits to policy during discovery win over the in-flight refresh", async (t) => {
  let finish;
  const s = setup(t, () => new Promise(resolve => { finish = resolve; }));
  const first = s.manager.refresh();
  while (!finish) await new Promise(resolve => setImmediate(resolve));
  s.edit(config => { config.plugins.entries["aegis-governance"].config.modelPolicy.enabled = false; });
  finish(catalog);
  await assert.rejects(first, /changed|disabled/i);
  assert.equal(s.writes, 0);
});

test("a stale runtime snapshot cannot cause a no-op source mutation to commit", async (t) => {
  const s = setup(t);
  const stale = structuredClone(s.config);
  await s.manager.refresh();
  s.stale(stale);
  await s.manager.refresh();
  assert.equal(s.writes, 1);
});

test("discovery uses the same per-agent Codex home as execution", async (t) => {
  let environment;
  const s = setup(t, async (_command, options) => {
    environment = options.env;
    assert.equal(existsSync(environment.CODEX_HOME), true);
    return catalog;
  });
  await s.manager.refresh();
  assert.equal(environment.CODEX_HOME, join(s.stateDir, "agent", "codex-home"));
});
