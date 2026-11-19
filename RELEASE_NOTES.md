# 1.0.1-preview.1

Local preview candidate; no registry publication has been performed.

- Repaired typed OpenClaw lifecycle hook registration and added shared user-chat admission for native Codex runtime paths.
- Added opt-in runtime-driven model discovery with provider-default/pinned policies, focused host updates, status/refresh CLI, and selection history.
- Initial admission/tool audit failure now explicitly blocks the operation. Records use UUIDs and flushed append-only writes. Every delivered tool-call event is reviewed and recorded, rather than a fixed tool-name allowlist. Approval outcomes reference their initial record.
- Approval outcome callbacks are observers: OpenClaw does not await them before executing an approved call. An outcome-write failure is reported but cannot revoke host approval. Initial tool-decision audit remains mandatory.
- Removed scoring penalties for urgency, honest uncertainty and prior-discussion references alone. Direct negation is handled per occurrence; later affirmative override clauses remain reviewable. Thresholds must be finite and within 0–100.
- Build dependency pinned to tested OpenClaw 2026.6.10 from the public npm registry; machine-local lockfile links removed. Runtime remains a peer dependency and is not bundled.
- Apache-2.0 license selected by Tracey. NOTICE retains attribution and clarifies that AEGIS trademark rights are not granted.

## Preview boundaries

Lexical scoring is an inspectable heuristic, not action authorization, semantic intent recognition or a security sandbox. Direct native Codex agent CLI runs in the tested host do not emit the same admission gate as UI chat. Hook coverage depends on host dispatch; a loaded plugin does not prove every operation is intercepted. Preserve the host's own tool permissions and approvals.

Bookshelf contains prompt/tool text on this local machine. Review its access permissions and retention before sharing diagnostic records. Basic structured credential fields are redacted from tool audit records; text in free-form commands/prompts may still contain sensitive information. The plugin does not inspect account credential stores.

Windows local runtime and Gateway are tested. POSIX discovery cleanup has fixture coverage but has not been tested on a POSIX machine. A release candidate is not evidence of cross-platform production readiness.
