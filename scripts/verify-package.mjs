import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
assert.equal(lock.packages[""].version, pkg.version, "Lockfile version must match the release");
assert.equal(lock.packages[""].license, pkg.license, "Lockfile license must match");
assert.equal(pkg.license, "Apache-2.0");
for (const [key, value] of Object.entries(lock.packages)) {
  assert.ok(!value.link, `Local dependency link: ${key}`);
  assert.ok(!/^(?:[A-Za-z]:|file:)|\\/.test(key), "Machine-specific lockfile path");
  if (value.resolved) assert.ok(value.resolved.startsWith("https://registry.npmjs.org/"), `Non-public-registry dependency: ${key}`);
}
assert.ok(process.env.npm_execpath, "Run through npm run verify:package");
const result = spawnSync(process.execPath, [process.env.npm_execpath, "pack", "--dry-run", "--json", "--ignore-scripts"],
  { encoding: "utf8", timeout: 30000, maxBuffer: 4 * 1024 * 1024 });
if (result.error) throw result.error;
assert.equal(result.status, 0, result.stderr);
const [archive] = JSON.parse(result.stdout);
const files = archive.files.map(file => file.path);
for (const required of ["LICENSE", "NOTICE", "README.md", "RELEASE_NOTES.md", "package.json", "openclaw.plugin.json", "dist/index.js"]) {
  assert.ok(files.includes(required), `Required archive file missing: ${required}`);
}
for (const file of files) {
  assert.ok(!/(?:^|\/)(?:node_modules|\.git|\.aegis|work|outputs)(?:\/|$)|\.env(?:\.|$)|\.jsonl$|\.npmrc$/.test(file), `Private/runtime file in archive: ${file}`);
  assert.ok(!file.startsWith("/") && !file.includes(".."), `Invalid archive path: ${file}`);
}
assert.deepEqual(archive.bundled, [], "Host runtimes must not be bundled");
console.log(`Verified ${pkg.name}@${pkg.version}: ${files.length} files, portable public-registry lock, required notices, no bundled runtimes.`);
