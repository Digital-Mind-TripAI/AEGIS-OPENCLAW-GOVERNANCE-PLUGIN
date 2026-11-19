import { createInterface } from "node:readline";
import { writeFileSync } from "node:fs";
const mode = process.argv[2];
if (mode === "ignore-term") { process.on("SIGTERM", () => {}); setInterval(() => {}, 1000); }
if (process.env.AEGIS_TEST_PID_FILE) writeFileSync(process.env.AEGIS_TEST_PID_FILE, String(process.pid));
createInterface({ input: process.stdin }).on("line", line => {
  const request = JSON.parse(line);
  if (request.id == null) return;
  if (request.method === "initialize") {
    process.stdout.write(JSON.stringify({ id: request.id, result: { userAgent: "fixture-future-runtime" } }) + "\n");
    return;
  }
  if (mode === "timeout" || mode === "ignore-term") return;
  if (mode === "exit") process.exit(4);
  if (mode === "malformed") { process.stdout.write("not-json\n"); return; }
  const second = Boolean(request.params.cursor);
  const id = mode === "duplicate" ? "same" : second ? "future-next" : "future-current";
  const result = { data: [{ id, model: id, displayName: id, isDefault: !second,
    inputModalities: ["text", "audio", "future-input"], supportedReasoningEfforts: [{ reasoningEffort: "low" }],
    futureResponseProperty: { nested: true } }],
    nextCursor: mode === "loop" || (!second && ["paged", "duplicate"].includes(mode)) ? "cursor" : null };
  process.stdout.write(JSON.stringify({ id: request.id, result }) + "\n");
});
