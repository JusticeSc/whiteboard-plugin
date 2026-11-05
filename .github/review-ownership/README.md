# Pull-request review policy reference

The files in this directory are retained review-policy code and configuration from a governance template. They are not invoked by the current package scripts or [.github CI workflow](../workflows/ci.yml), and they do not configure GitHub branch protection.

No weighted-approval publisher or review-event workflow is present in `.github/workflows/`. The local policy JSON and scripts must not be described as active status checks. Repository administrators must verify any remote status requirements and permissions independently.

The code and tests remain available for reference or explicit future reactivation. Do not infer that a test passed, a workflow ran, or a remote rule is configured from these files alone.
