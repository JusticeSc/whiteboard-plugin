---
name: dsh-client-ui-ux
description: Design or review product-user-visible GUI changes: visual token ownership, component reuse, feedback, loading, overlays, responsive behavior, locale-owned copy, window adaptation, and real rendered evidence.
---

# Client UI/UX

This is judgment guidance, not a complete checklist or design approval. Read [architecture](../../../docs/architecture.md), the affected application's component/data/store/effect contracts, and [conditional domain rules](../../../docs/defensive-patterns/conditional-domains.md) before implementation. Copy coverage follows [dsh-prose-standard](../dsh-prose-standard/SKILL.md); failure guarantees follow [dsh-error-handling](../dsh-error-handling/SKILL.md). Identify the actual owners of UI frameworks, tokens, notifications, locale data and browser harnesses when introducing a GUI.

## Architecture prerequisites

Separate business data, presentation, and framework integration. Use one authoritative subscribed data path; pure derived values must not become mirrored subscriptions. Keep observable sources and snapshots stable, and republish snapshots in the same successful state-transition step. Trace borrowed state, retention, and publication to the documented commit point. Framework-specific slots, injection, compiler views, or service lifetimes apply only when that framework exists.

For a host model restricting UI-plugin value exports to its loader/store-type factory pattern, any additional value export needs explicit user sign-off; a matching consumer is insufficient. Do not widen that API for tests or import sibling-feature values. Put shared runtime code at its narrow real owner or escalate a missing framework extension point. This conditional rule does not impose UI-plugin semantics on ordinary library exports; those follow the repository package-surface policy.

## Visual foundation

- Search the target page and nearest established sibling before adding literals or treatments. Reuse shared colors, radius, spacing, typography, motion, clearance, page padding, and established primitive treatment. Bind an actual theme owner instead of copying another product's token names or geometry.
- Verify readable ink/background pairs in light and dark themes. Dimmed text is not assumed readable.
- Use the theme's typography roles or the page's established scale. Parallel content shares a size. Align icons, text, and neighbors deliberately along a baseline, center, or edge; keep optical proportions coherent.
- Where adopting the source visual system, feature CSS font weight is at most 500, with the markdown typography-token exception. A different system must explicitly bind its design policy; do not silently universalize source token values, the 13px row size, radius scale, or material exceptions.
- Preserve intentional gaps and symmetry for parallel elements. A one-off offset needs a reason, not another magic value.

## Reuse before adding

Extend the existing component or interaction before creating a parallel surface. Shared sidebars and navigation register with their existing owner rather than creating duplicates; tabs need meaningful icons where the host uses them. Use the existing icon library. New glyphs require designer approval before landing. Icon-only controls with unclear meaning need the shared Tooltip; selectable explanatory content uses the shared hover-card equivalent, not an ad-hoc title attribute.

## Feedback surfaces

Choose feedback by lifetime, not convenience:

- Transient operation outcomes use the app-wide notification host, which must outlive the reporting panel/tab. Report actual success or failure, never pending work as success.
- A failed operation retains its data: failed deletion keeps the row. Do not blank content to announce an operation error.
- Query failures and field validation belong in place with their recovery action. A populated surface keeps content and a compact notice; only an empty surface centers the full error state.
- Keep copy short, plain, localized, actionable, and layout-stable. Expose technical codes only when needed for recovery or diagnosis. Preserve impact, uncertainty, and next action; brevity never erases failure guarantees. A Chinese notice of at most two sentences omits the trailing full stop.

## Loading and overlays

Lists use their skeleton; other page-level loads center a bare spinner. Use one coherent loading treatment per surface; avoid unnecessary loading text.

Verify every menu, popover, and tooltip in the actual rendered application:

1. Outside click and Escape where focusable dismiss it.
2. Flip or slide with a stable viewport margin, choosing a side that fits without oscillation.
3. Escape ancestor clipping and stacking (a portal where needed), with no neighboring occlusion.

Use the shared internal scrollbar treatment; keep bars inside their containers and clear of rounded corners. Preserve keyboard access, focus, and reduced-motion behavior. Apply [responsive UI](../dsh-responsive-ui/SKILL.md), including 390 CSS px, touch/no-hover, truncation, and focus on width changes.

## Locale-owned copy

Locale owns product chrome, accessibility labels, tooltips, placeholders, status, units, and templates. Use the typed dictionary and standard locale access, or complete explicitly localized primitive props; no fallback language. Stable IDs and discriminants are not display translations. Keep user/model/provider/wire/OS values and code tokens verbatim. Pre-locale boot messages and externally supplied content need narrow documented ownership exceptions, not blanket exemptions. Dictionary parity and source-ownership analysis are distinct; neither proves arbitrary dynamic strings translated. Exercise each affected locale's real behavior.

## Window and build boundaries

For desktop-hosted pages account for the actual supported window chrome. A shared safe-area/clearance token has one owner; fix one page with a scoped override, not a global token change. Review the total clearance plus page inset, and assert the relevant platform stylesheet behavior. Do not invent macOS/Windows evidence for unrun hosts.

Browser-injected build values are public artifact content, never a secret channel. Keep declared values consistent across actual build faces; do not enumerate or dynamically look up environment variables. Consumer build evidence binds public values and artifact digests to the current build. Post-build variation uses runtime configuration. Model credentials never belong in a client build.

## Review and evidence

Exercise the affected tier: component presentation, data flow, host/runtime, and built assets are different evidence. Inspect real light/dark/narrow layouts, touch and keyboard behavior, overlays, loading, and failure states. Follow [record-browser-gif](../record-browser-gif/SKILL.md) for GUI PR evidence; real model rounds and model keys apply only to actual model flows. Extensive or clearly perceptible UI/interaction changes need designer or product review. Missing human authority is an explicit review prerequisite, not simulated approval or an automated-check substitute.
