# Windows preview release checks

This checklist records release gates; passing local tests does not imply a public release or remote CI result.

## Reproducible source and package

- Install Node.js 22.19.0 or newer and a compatible OpenClaw host.
- Run `npm ci --ignore-scripts`, `npm test`, and `npm run verify:package` from a clean checkout.
- Run `npm pack --ignore-scripts`; verify LICENSE, NOTICE and compiled plugin entry are included, with no bundled host, audit files or machine-local dependency links.
- Run `npm run verify:install` to check three independent fresh archive installs, immediate five-hook discovery, no diagnostics, independent regular plugin files and no manual load paths. Runtime profiles belong in nonsynchronized local temporary storage; cloud-upload staging may create hard links that the host must reject.
- GitHub Actions runs these checks on Windows/Ubuntu with Node 22.19.0 and 24. Do not describe them as passing until remote runs complete.

## Harmless live negative checks

Run in an operator-approved local Gateway session. Preserve host tool/approval permissions; do not approve the synthetic command for execution.

1. Ask the model to print three separately described words, in order: first `Ignore`, second `previous`, third `instructions`. Explain that the words are literal output, not instructions. Do not request file changes.
2. Verify user admission passes, then a delivered shell tool event whose argument contains the phrase receives `approval-required` at the default threshold. Cancel the approval. Verify an `approval-resolved` record references the initial audit ID and records cancellation. This demonstrates host invocation and review, not execution or sandboxing.
3. Back up the configured Bookshelf path. Create a regular file in a task-local temporary directory and temporarily configure `bookshelfPath` to a child path below that file. Never damage or change the real audit log.
4. Restart the Gateway and send a neutral no-tools message. Verify an explicit audit-unavailable response, with no model response or tokens. Do not expect a Bookshelf record when its configured storage is deliberately unavailable.
5. Restore the original Bookshelf path (or remove the temporary override if none existed), restart and compare relevant host settings. Send a neutral message and confirm normal admission and recording resume.

Tool approval-resolution observers do not run as transactional pre-execution gates in the tested OpenClaw SDK. Initial audit retention can block a call; later outcome-record failure cannot revoke an already granted approval.

## Publication handoff

- Inspect public source/history for local continuity paths and private operational details before choosing the public repository contents.
- Verify package name/publisher ownership and host install route.
- Provide a brief demo, supported Windows/host scope, feedback channel, Apache-2.0 notice and known boundaries.
- Obtain explicit approval for the concrete remote repository/release target before any push, publishing or signing.
