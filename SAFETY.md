# Safety

English | [中文](SAFETY.zh.md)

## Scope and guarantees

This repository contains a DSH whiteboard plugin, not a general security boundary. Host code is authoritative for durable canvas and session-preference data; the browser client is a rendering and selection-reference bridge. The plugin does not guarantee that the surrounding DSH installation, credentials, dependencies, or remote automation are safe.

The Host validates JSON, HTTP input, imported canvas documents, and model-tool arguments at their boundaries. Preserve revision checks, field-level human-priority conflicts, AI-switch enforcement, stable error codes, and undo behavior when changing those paths. Do not treat a hidden client control as a security control; the Host must enforce the AI switch.

## Commands and persistent data

Repository commands run with the invoking account's permissions. Review scripts before using them with production data, credentials, or a real DSH profile. Never commit secrets, local caches, browser artifacts, or copied credentials.

The optional end-to-end check must use its isolated `DSH_HOME` and throwaway `.spike-e2e/` store. Do not run it against the real DSH home. Before importing or deleting canvas data, preserve the intended source and verify the available rollback path; documentation and tests do not replace a data backup.

## Responsible use

Use DSH, repositories, credentials, and remote services only with authorization. Treat imported JSON, HTTP payloads, canvas text, model proposals, and external manifests as untrusted input. Publishing or changing remote GitHub, DSH host, profile, or branch-protection configuration requires separate authorization.

This package is source-distributed through GitHub and installed as a private DSH bundle. It is not an npm publication. Local review-policy files describe repository guidance only; they cannot prove that remote GitHub settings are enabled.

## No warranty or liability

Use the software with an understanding of its risks. It is provided under the [MIT License](LICENSE) without warranty. To the maximum extent permitted by law, the authors and copyright holders are not liable for computer damage, data loss or disclosure, lost files, or other harm arising from its use.
