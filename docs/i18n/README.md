# Bilingual documentation

English | [中文](README.zh.md)

This page covers the English and Simplified Chinese governance documents that already have counterparts. It does not require translating the plugin's existing single-language product documentation. [Translation rules](translation-rules.md) define fidelity and structure; [terminology](terminology.md) supplies shared terms.

## Pairing rules

- Both languages carry equal authority. Either side may be authored first; update its counterpart in the same change and resolve factual disagreements against the owning code or product document.
- A pair consists of sibling `foo.md` and `foo.zh.md` files. Keep the language switcher immediately after the H1: `English | [中文](foo.zh.md)` on the English side and `[English](foo.md) | 中文` on the Chinese side.
- Preserve heading order and depth, list and table structure, literal commands and code, and equivalent link targets. Use the matching language when a linked document has a counterpart; keep the original path for single-language product documents.
- Deletion or rename carries both sides and their inbound links. Do not create a counterpart solely to satisfy an inherited template assumption.

## Review workflow

1. Read the owning product facts and the terminology relevant to the change.
2. Update the changed passages on both sides, preserving unaffected reviewed wording.
3. Compare the pair clause by clause for actors, conditions, obligations, exceptions, failures, and side effects.
4. Check switchers, headings, lists, tables, code, relative paths and fragments. Report the review and commands actually performed.

The package has no translation-pairing generator, hash-record verifier, documentation gate, or installed translation hook. Imported `.i18n.yaml` records for the adapted governance pages are not maintained; they must not be treated as proof of consistency. The active checks remain those in [testing](../testing.md) and the package manifest.

## Scope and exclusions

Apply this workflow to retained paired governance pages, including contribution, safety, architecture, development, testing, defensive guidance and this directory. Preserve existing product-document language and release evidence unless the requested change affects their facts.

Agent instructions and skills may remain English-only, and the terminology table is bilingual within one file. Installed, generated and vendored trees are outside authoring scope. Frozen historical Agent Notes are not translation-maintenance targets; preserve their content and companions.

## Responsibility

The working author updates the counterpart directly; a separate translation delegation is optional. Manual review establishes semantic equivalence, not remote CI or human approval that did not occur. Any future automated pairing system needs an explicit tooling change and current manifest and CI support before its commands become required.
