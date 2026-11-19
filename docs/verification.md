# Preview verification

Current local candidate:1.0.1-preview.2, Apache-2.0. Earlier baseline evidence below applies to1.0.1-preview.1 unless specified.

Local Windows validation:28tests pass, public-registry clean install, clean consumer package import and five typed hooks verified.

Live Gateway validation:
- Ordinary model response with adaptive provider-default selection.
- Affirmative override chat returns deterministic AEGIS review with zero model tokens.
- Delivered native tool review creates approval-required and linked cancelled outcome; no synthetic command executes.
- Temporarily unavailable audit storage returns explicit block, then normal chat and audit resume after restoration.

The configured GitHub Actions matrix must pass independently before its results are described as verified. Windows/Ubuntu and minimum Node/24 are configured; local evidence alone does not certify all platforms.

Direct native CLI admission, host-dependent hook dispatch, lexical false positives/negatives and nontransactional approval-outcome logging remain documented boundaries. See README.md and RELEASE_NOTES.md.

## Additional Windows acceptance observations

The packaged archive installed into a separate state/config environment. After explicit conversation access was configured, runtime inspection loaded all five hooks with no diagnostics. Disabling removed the active hooks; re-enabling and inspecting in a new host process restored all five. Uninstall removed the plugin directory and configuration. These are installation and runtime-inspection checks, not a fresh-profile Gateway/provider inference test.

An exploratory communications sample passed ordinary requests, urgency, uncertainty, disagreement and a negated override. It also reproduced false positives for educational quotations of override phrases and self-directed language such as `I feel stupid asking`. A Spanish override request was not detected. These observations establish concrete heuristic limitations, not a measured accuracy rate or multilingual support.

Full fresh-profile Gateway inference and a sustained-use trial remain unverified. The earlier live cancellation and audit-unavailable recovery checks do not substitute for other approval outcomes; follow-up evidence is recorded below.

### Follow-up communication fixes (local source)

Two additional regression tests bring the local suite to30 passing tests. Admission now accepts the two complete discussion forms reproduced above and the specific self-directed uncertainty expression. Extra directives, unmatched/bare quotes, and later insults remain reviewed; tool evaluation explicitly uses a surface with no discussion exception. Package validation passes. The earlier28-test hosted result applies to the published baseline; these changes have not yet run in hosted CI.

### Follow-up live Gateway checks

After restart, the educational quotation and self-directed uncertainty examples each received a normal model response and passing audit record. A quotation followed by an affirmative override was blocked before model dispatch with zero model tokens. A print-only request whose resulting native tool payload scored5 against threshold75 was blocked outright after passing admission.

Moderate tool failure was separately tested with explicit denial and allow-once. Denial yielded a declined native tool result; allow-once executed the exact harmless print command and returned its expected text. Both outcomes were retained with a parent reference to the initial tool review. Temporary reviewers were restricted to the test session and checked the exact command; no persistent auto-approval rule was installed.

The host initially rejected the internal approval requester's connection for an unapproved operator.approvals scope, producing cancellation rather than a reviewer decision. The local operator separately authorized that scope addition before testing continued. A functioning reviewer and appropriately paired requester are prerequisites for the approval flow; cancellation alone does not demonstrate explicit denial or allow-once.

### Preview.2 fresh-profile and ordinary-use checks

The local suite now has31 passing tests. A fresh-profile test uncovered a second-gate false positive on runners that add host context before before_agent_run. A bounded single-use receipt now preserves only the exact recently admitted discussion span; extra surrounding directives remain reviewed. Regression coverage includes consumption, session isolation, extra directives and retention of the original prepared prompt.

Installed the preview.2 archive into a fresh isolated home/state/workspace and ran a separate loopback Gateway with a deterministic local OpenAI-compatible provider fixture. Ordinary text, educational quotation and self-directed uncertainty each reached the fixture once; an affirmative override reached it zero times and returned the governance response. Audit records verified both admission stages. This is synthetic-provider integration evidence, not a new external-account sign-in or fresh-user onboarding proof.

Initial discovery/validation was inconsistent in isolated-profile attempts under synchronized Documents storage. Instrumentation subsequently established that Drive upload staging added a second hard link to installed manifest/package files, which the host correctly rejects. Windows listed the second link under Documents/.tmp.driveupload. Later inspection succeeded when that temporary link disappeared; retries and manual load paths did not fix the cause. A fixture response alone was deliberately excluded from governance evidence when the plugin was absent.

The signed-in Gateway also passed a bounded ordinary-use sample of disagreement, uncertainty with urgency, and negated safety boundaries, each with normal model response and audit. This is not an hours-long soak. Temporary test Gateway/provider processes were stopped. Public hosted CI has not run against these changes.

### Reliable local installation path

Moved the test runtime home/state into the OS local temporary directory, outside cloud-synchronized storage. Three independent cold archive installs passed, and the repository's new `npm run verify:install` independently passed three more fresh installs: each immediately discovered all five hooks with no diagnostics, retries, manual load paths or altered host safety policy. The verifier checks that installed package/manifest/entry files are independent regular files with link count1 and retains a local receipt. The existing normal host state was not relocated.

Repeated the full fresh-profile Gateway/local-provider-fixture check without the workaround. Ordinary text, educational quotation and self-directed uncertainty each reached the fixture once; override reached it zero times. Seven audit records verified the two admission stages. The test Gateway/provider stopped afterward. This closes the observed discovery failure for nonsynchronized local runtime storage, not for arbitrary synchronized folders. CI now includes the install verifier, but those new hosted checks remain unrun until an authorized push.
