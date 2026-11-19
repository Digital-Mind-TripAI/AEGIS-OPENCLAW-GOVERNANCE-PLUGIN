import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { discoverModels } from "../dist/models/discovery.js";

const fixture = resolve("tests/fixtures/model-runtime.mjs");
const options = mode => ({ args: [fixture, mode], timeoutMs: 3000 });

test("raw stdio discovery tolerates future fields, negotiates initialize and walks pages", async () => {
  const result = await discoverModels(process.execPath, options("paged"));
  assert.deepEqual(result.models.map(model => model.id), ["future-current", "future-next"]);
  assert.equal(result.runtimeVersion, "fixture-future-runtime");
  assert.equal(result.models[0].reasoning, true);
});

test("invalid protocol, early exit, duplicate models and cursor loops reject discovery", async () => {
  for (const mode of ["malformed", "exit", "duplicate", "loop"]) {
    await assert.rejects(discoverModels(process.execPath, options(mode)), /runtime|catalog|duplicate|pagination/i);
  }
});

test("timeout and cancellation terminate the owned discovery child", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "aegis-discovery-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const pidFile = join(directory, "pid");
  await assert.rejects(discoverModels(process.execPath, {
    ...options("timeout"), timeoutMs: 400, env: { ...process.env, AEGIS_TEST_PID_FILE: pidFile }
  }), /timed out/i);
  if (existsSync(pidFile)) assert.throws(() => process.kill(Number(readFileSync(pidFile, "utf8")), 0));
  const controller = new AbortController();
  const pending = discoverModels(process.execPath, { ...options("timeout"), signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, /cancel/i);
});

test("cleanup is bounded even when a POSIX runtime ignores graceful termination", async () => {
  const started = Date.now();
  await assert.rejects(discoverModels(process.execPath, { ...options("ignore-term"), timeoutMs: 400 }), /timed out/i);
  assert.ok(Date.now() - started < 2500);
});
