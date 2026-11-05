---
name: dsh-create-upgrade-guide
description: Use when a change breaks an externally perceptible CLI, data format, configuration or stored data, or published package entry point, or changes a surface already covered by an unreleased upgrade guide.
---

# Create an upgrade guide

**Plugin scope:** This is reusable migration-writing guidance, not an installed upgrade-guide system. The private plugin is source-distributed as a DSH bundle; [AGENTS.md](../../../AGENTS.md), [package.json](../../../package.json), and the [CI workflow](../../../.github/workflows/ci.yml) define active checks. The upstream upgrade and translation verifiers and `.i18n.yaml` sidecars are not available or required here. Apply the proposed layout only when a guide is needed and authorized; review any bilingual pair manually.

An upgrade guide tells a reader who runs release vT what to change to run the next release. Write it in the change that introduces the break, as soon as the break is recognized; do not defer it to release preparation.

## Scope

Write a guide only for breaks that someone outside the repository can observe after upgrading:

- application commands, flags, accepted values, or output paths;
- configuration or stored data that requires reader action to remain usable;
- published package names, entry points, exported functions, types, or accepted data fields.

Pre-stable internal APIs whose consumers are all updated in the same change need no guide. Keep the owning contract and any active decision record current; a guide states the reader's migration actions and links those owners rather than replacing them. Do not create a guide merely to populate this directory or describe the initial template import.

## Location

`docs/upgrade-guide/v<version>/<item>/guide.md`

- `<version>` is the `version` field of the root `package.json` when you write the guide, for example `v0.2.1-rc.2`. The guide describes the upgrade from that release to the next one.
- `<item>` is a kebab-case name of the changed surface, for example `output-flag-rename`.
- Each item directory holds exactly `guide.md`, its Chinese counterpart `guide.zh.md`, and the pairing record `guide.i18n.yaml`: no index, no attachments.

## Maintenance

While the root version is unchanged, the current version directory describes the delta from vT to the current development branch. When a later change touches a surface a guide there covers, update that guide in the same change; delete the guide when the break is reverted. After the version bump, guides in older version directories are frozen; a new break goes into the new version directory. Never write a guide spanning more than one release.

## Format

Start from the [upgrade-guide template](../dsh-doc/templates/upgrade-guide.md). Write a one-sentence description naming what breaks. `verify-upgrade-guides` checks:

- frontmatter with exactly `kind: upgrade-guide` and a non-empty `description`; add a key only together with its check, then backfill every guide;
- one `#` title, then exactly the `## Change` and `## Migration` sections in `guide.md`, and `## 变更` and `## 迁移` in `guide.zh.md`, in that order;
- at most 500 words in `guide.md`, frontmatter included.

`Change` states the old and new behavior of the surface and who is affected. `Migration` lists ordered steps that name exact files, keys, commands, or symbols, and states how to confirm the migration worked.

When a guide needs more than 500 words, the extra text belongs elsewhere: link source files or symbols instead of restating code, move rationale into an [Agent Note](../../notes/README.md), and turn repeated mechanical steps into a script or generator command that the guide invokes.

Follow [dsh-prose-standard](../dsh-prose-standard/SKILL.md). Write the Chinese counterpart in the same change under the [bilingual pairing rules](../../../docs/AGENTS.md), then record the pair with `pnpm run verify-translation-pairing --write docs/upgrade-guide/v<version>/<item>/guide.md`.

## Verify

```sh
pnpm run verify-upgrade-guides
pnpm run verify-translation-pairing docs/upgrade-guide/v<version>/<item>/guide.md
pnpm run verify-md-links
```
