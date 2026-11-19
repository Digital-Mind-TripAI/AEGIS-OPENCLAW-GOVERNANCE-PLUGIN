# AEGIS OpenClaw Governance

An AEGIS preview by Tracey Prutch, published by Digital Mind Trip AI. [Report an issue](https://github.com/Digital-Mind-TripAI/AEGIS-OPENCLAW-GOVERNANCE-PLUGIN/issues) or review the [verification scope](docs/verification.md).

Native OpenClaw plugin with local seven-virtue Prism checks, user-chat admission, tool-call review and append-only Bookshelf logging. Governance does not require a particular model. Scoring is a transparent lexical heuristic, not a validated measure of intent or execution safety.

## Development and local loading

Requires a compatible OpenClaw installation and Node.js 22.19.0 or newer. Build and test with `npm ci --ignore-scripts`, then `npm test` and `npm run verify:package`. The public-registry lockfile pins the development host to the tested OpenClaw 2026.6.10 package. The installed host remains an external peer dependency and is not bundled in the preview. GitHub Actions checks Windows and Ubuntu on the declared minimum Node version and Node 24; remote results are available only after the repository is pushed.

Link a trusted local checkout with `openclaw plugins install --link <absolute-repo-path>`. Enable `aegis-governance` and grant its conversation hooks access through `plugins.entries.aegis-governance.hooks.allowConversationAccess=true`. Start or restart the Gateway, then inspect with `openclaw plugins inspect aegis-governance --runtime --json`.

## Adaptive models (opt-in)

The Codex runtime plugin must already be installed and enabled. Existing sign-in is managed by OpenClaw/Codex; AEGIS never reads or writes account credentials, installs runtimes, or changes tool permissions.

Enable `plugins.entries.aegis-governance.config.modelPolicy`:

```json
{
  "enabled": true,
  "mode": "provider-default",
  "onMissing": "hold",
  "runtimeCommand": "auto",
  "refreshSeconds": 900,
  "timeoutMs": 15000
}
```

Restart the Gateway after enabling. The service discovers models at startup and every 15 minutes using the executable it configures for native Codex execution. On Windows, auto mode locates the installed OpenAI Codex desktop package through the OS; an explicit absolute native executable path is supported. macOS checks the installed Codex desktop app, then an explicit existing host command/PATH executable; Linux uses an explicit existing host command or PATH. No versioned executable path or model-name list is baked into the plugin.

- `provider-default` follows the sole visible text model the runtime marks as default.
- `pinned` requires a `model` ID. If it disappears, `onMissing: hold` retains the last configuration and exposes an error. `onMissing: provider-default` explicitly permits replacement with the runtime's recommended default.
- Empty, malformed, hidden-only or ambiguous catalogs, failed discovery and changed/disabled policies do not replace configuration.
- Changes update native model metadata, the selected model's allowlist/runtime mapping, the default model and the Codex executable. Existing fallback lists, explicit agent models and unrelated settings are retained. Custom OpenAI transport/authentication conflicts require explicit migration.
- Discovery is not proof of account access or successful inference. Current runtime reports no context/pricing budgets in model/list; missing budgeting fields use host compatibility defaults (200,000 context, 8,192 output; zero per-token API accounting for the native subscription transport). Existing configured budgets are preserved. These defaults are not measured provider limits.

Discovery uses the default agent's `codex-home`, matching OpenClaw's filesystem context. OpenClaw supplies its chosen OAuth profile separately when executing a turn; AEGIS does not handle that credential bridge. Catalog metadata can be cached and does not prove that the execution account accepts a model. Custom WebSocket transports, nonstandard app-server arguments and environment-clearing configurations are refused rather than silently discovered through a different local path.

Use `openclaw aegis-models status` for the current catalog, policy, selected model and error; `openclaw aegis-models refresh` requests a bounded manual refresh of an enabled policy. The status snapshot and append-only `history.jsonl` are stored under the OpenClaw state directory's `aegis-model-policy/` folder. Proposed/applied selections and failures are inspectable. A live refresh lock prevents overlapping Gateway/CLI updates; dead-owner locks can be recovered, while unreadable locks require operator inspection.

Disable `modelPolicy.enabled` to stop automatic changes; disabling retains the currently selected configuration. Original settings should be backed up before first activation.

## Verified governance boundaries

User-facing Gateway chat admission uses `before_agent_reply`, returning an IDQRA explanation and recording the decision before model dispatch. `before_agent_run` remains for runners that emit it. Direct native Codex agent CLI paths in OpenClaw 2026.6.10 did not emit that gate; registration alone does not establish coverage. Every tool event delivered to `before_tool_call` is reviewed, including native aliases and unfamiliar tool names. This is lexical review, not a command sandbox or grant of action authority.

Admission and initial tool decisions require an append-only Bookshelf record flushed to disk. Storage failure returns an explicit audit-unavailable block. Each record has a UUID and gate/tool metadata. Moderate tool failures request host approval when `blockOnFail` is true; critical failures block outright. With `blockOnFail: false`, failing tool reviews block outright rather than request approval. This legacy option name is retained for compatibility.

Approval outcomes are appended with a reference to the initial record. OpenClaw runs the outcome observer without waiting before an approved call, so a late outcome-write failure cannot revoke approval; it is reported as such. User prompt and free-form tool text are retained locally; structured credential-key values are redacted from tool audit text, but this is not comprehensive free-text secret detection. Do not share raw Bookshelf files without inspecting them.

Ordinary urgency, truthful uncertainty and prior-discussion references alone do not reduce scores. Directly negated overrides are distinguished from later affirmative clauses. These rules are a bounded English-language heuristic and can still misclassify quoted, multilingual or complex instructions. They do not establish that an operation is safe or authorized.

## License and attribution

Apache License 2.0; see LICENSE and NOTICE. Copyright 2026 Tracey Prutch. Code reuse is permitted under those terms; permission to use AEGIS names, logos or trademarks is not granted. See RELEASE_NOTES.md for tested behavior and preview boundaries.
