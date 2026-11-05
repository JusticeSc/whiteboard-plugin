# Conditional documentation website workflow

The template has no documentation website. This named reference preserves the method for a project that introduces one; it does not claim an installed projector, preview command, public route, or deployment. The [documentation standard](../../../../docs/AGENTS.md) remains the current owner. Establish actual manifest/config/projector/test owners before publishing pages.

## Canonical source and manifest

Repository Markdown remains the only editable source, including sibling bilingual triplets. Keep an explicit public allowlist mapping sources to route trees and a disposable generated projection; do not create a second editable source tree under website locale or route directories. Generated catalogs remain at their canonical owner and freshness gate, then project through the manifest. Do not publish maintainer instructions, RFCs, postmortems, or testing material simply because they exist; public-scope expansion needs the user's decision.

Before changing a manifest read its real page type and current entries. Before changing section/sidebar/locale/navigation read the actual site configuration. Ordinary page edits change canonical source only. New pages add one approved mapping. Moves/removals update source, mapping, and all inbound repository links atomically, preserving public routes/aliases. Generated references change their generator, never output by hand.

## Mapping contract

The actual type owns spellings, but each mapping decides canonical source, public route, label, sidebar, section, order, and optional source aliases. Paired mapping derives the Chinese sibling and counterpart aliases. Same-language mirroring is an explicit fallback, converted to a pair when a counterpart exists. A source alias redirects repository-link resolution, not a new public route. Do not copy a source-product schema without implementing its resolver.

## Link projection

Preserve these behaviors in the real projector and its negative tests:

- Mapped relative targets become site routes.
- Existing unmapped targets remain source links, preserving supported line suffixes.
- Images are copied to generated public assets only from regular files inside the repository; reject symlink escapes and outside files.
- External, site-absolute, email, and fragment-only links remain unchanged.
- Missing relative targets fail projection, never silently become broken links.
- Cross-page fragments use canonical English GitHub heading IDs. Add explicit authored aliases when site heading IDs differ; generated aliases belong to the generator.

Canonical Markdown does not contain site-only routes to satisfy a renderer. Emit raw-Markdown twins and an `llms.txt` index from the same manifest if this source-style publication interface is adopted; no competing inventories.

## Preview, checks, and deployment

Bind and execute the project's actual local preview and site-check scripts; do not invoke source-product `docs:dev`/`docs:check` names unless they have been implemented here. Inspect rendered navigation, both locales, copied images, fragments, raw twins and index. A Markdown link check alone does not prove projected routes or anchors. Include useful valid and missing/outside/fragment-invalid fixtures through the real projector, then relevant docs/pair/link checks. Report affected canonical sources, mappings, routes and actual results.

Content synchronization and a local build do not publish to the internet. Hosting permissions, deployment workflow, domain, public access, and release require separate explicit authorization and hosting policy. No website task implicitly grants remote mutation.
