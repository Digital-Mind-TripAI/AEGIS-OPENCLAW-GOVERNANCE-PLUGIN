# Public preview source continuity

This branch contains the reviewed distributable source for AEGIS OpenClaw Governance.
Local operational transcripts, machine-specific configuration and audit records are not part of this public history.

Before changing code, read README.md, RELEASE_NOTES.md and docs/preview-release-checklist.md.
Validate changes with npm ci --ignore-scripts, npm test and npm run verify:package.
Keep model policy separate from governance scoring; never claim hook registration proves all execution paths are intercepted.
Do not publish packages or change host permissions without the operator's authorization.
