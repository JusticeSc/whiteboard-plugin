# Continuous integration and review policy

The active [CI workflow](workflows/ci.yml) sets up Node 24, runs `npm test`, checks `index.js` with `node --check`, and runs the disposable install/rollback isolation regression on Windows. The aggregate job requires both Linux and Windows results. The optional browser check is not part of CI because it requires a DSH installation, Chrome, credentials, and an isolated `DSH_HOME`.

Do not describe pnpm, TypeScript, workspace, or aggregate-gate material as this plugin's active build. The package manifest and root [AGENTS.md](../AGENTS.md) define its runnable checks.

The review-policy files under `review-ownership/` are retained reference material; no weighted-approval or review-event workflow is present here. They do not configure branch protection, and local files cannot prove remote workflow execution, status requirements, or reviewer permissions. Administrators must verify remote settings separately.
