---
name: dsh-official-plugin-artwork
description: Draw or review official or experimental plugin package artwork and optional built-in feature previews, including semantic subject, optical proportions, lettering, transparency, localized assets, metadata, payload, and designer approval. Not toolbar or action icons.
---

# Official plugin artwork

Use this named capability when the project actually has official plugin artwork. A Web application alone does not create a plugin catalog or require previews. Read [conditional domain rules](../../../docs/defensive-patterns/conditional-domains.md), the real manifest, nearest SVGs and renderer, and every affected list/detail/component metadata owner. Guidance and structural checks never replace designer approval.

## Establish and draw the subject

Inspect the actual feature and its produced assets before choosing a metaphor. Reuse designer-supplied assets; do not invent brand marks or change names, identifiers, unrelated artwork, or feature output without approval. Borrow one coherent treatment from actual neighboring artwork. Toolbar/action icons follow [UI/UX](../dsh-client-ui-ux/SKILL.md#reuse-before-adding).

1. Use one dominant subject with only explanatory detail. Related capabilities may share a metaphor distinguished by proportion, silhouette, or palette rather than extra badges and panels.
2. For the source-compatible glyph format use `width="36" height="36" viewBox="0 0 36 36"`; 18–22 units is a starting extent, not a universal silhouette rule. The actual renderer owns tile framing and display size; do not bake the tile into the image or enlarge a toolbar glyph to fill it. Another declared glyph format needs its actual owner rather than a silent dimension change.
3. Balance the main subject and secondary marks optically. Deliberately align repeated corners, tails, handles, and margins. Refine one requested dimension at a time, preserving approved parts.
4. Prefer restrained palettes, flat fills or short gradients, and limited layering. Vivid/neon colors need approved brand, essential contrast, or designer direction. Tune saturation independently of hue and brightness; avoid muddy gray. No glow, shadow, gloss, or emoji as decoration.
5. Outline readable lettering as paths without font dependencies. Compare visible ink, cap height, baseline, weight, and spacing; stroke caps and joins can defeat nominal coordinate alignment.
6. Cutouts must be genuinely transparent: use local masks or geometry, not a white/dark disk. Compare on both themes.

## Asset and payload ownership

Use the actual manifest icon path and publish its referenced resources. Keep intentional bundle/component copies aligned; inspect localized labels where in scope. An `<img>` SVG is self-contained geometry with local uniquely named gradient/mask/clip references: no scripts, event handlers, animation, external image/style/font, or `foreignObject`. Inline framework artwork needs per-instance IDs; separate image documents do not share IDs. Keep runtime dependencies, primitive exports, and renderer special cases out of an asset-only change.

Verify metadata and raw published payload at their actual owners. If a catalog derives from them, regenerate it through its real generator; do not hand edit the catalog or invoke source-product commands absent from this project.

## Optional built-in feature previews

A preview is optional when description text suffices. Essential instructions remain localized text outside the image. If adopting the source built-in-only preview model, preserve this complete contract:

- Zero or one logical image per built-in feature; `en` and `zh` are alternatives, not a gallery. Keep an internal typed bilingual map owned by the real client. Do not add third-party declarations, Host API, metadata fields, or package exports to expose previews.
- SVG only, `width="640" height="300" viewBox="0 0 640 300"`; both raw language files together at most 1 MiB. One main example and at most one close-up; important content about 32 canvas units from edges. Outline lettering, translate headings/annotations/examples, and preserve official names and assets.
- Self-contained paths: no fonts, scripts, handlers, animation, external resources/stylesheets, `text`, or `foreignObject`. Only an unchanged official PNG/JPEG/WebP brand asset may be embedded as a base64 data URL in a preview. This exception never permits raster preview files or raster small glyphs. Envelope checks do not decode pixels or prove meaning.
- Render one proportional `<img>` below description/status and above component/source details, aligned to description. Source-model spacing is 24px above and 32px before following detail; natural canvas 640×300, maximum available width and 320px height, page-owned border/16px corners. Different target geometry needs an explicit renderer/design binding.
- Current locale chooses the image and localized feature-name alt text. It remains visible before activation; decode failure gives a localized notice without blocking controls. Lists/component rows keep small glyphs. Omission reserves no space.

Do not add this preview model to an unrelated GUI solely to exercise the Skill. When it is adopted, bind the map, asset validator, renderer, and behavior tests to real target owners in the same change.

## Review and verify

Show numbered alternatives before uncertain geometry is polished; retain labels and apply the selected version. Store comparison artifacts only in a confirmed ignored directory. An existing draft is not approval. Compare old/new beside unchanged actual references in light/dark at row/card size and enlarged; inspect optical balance, lettering, empty space, clipping, and decoding.

Build actual affected artifacts and exercise the real page, refreshing metadata-caching hosts only after batching approved refinements. For a preview inspect both locales before activation, natural dimensions, narrow 390px layout, no-preview and third-party negative cases, and decode failure. Require real format/security rejection, metadata/payload freshness, visual review, and designer approval before landing new glyphs. Follow [record-browser-gif](../record-browser-gif/SKILL.md) for GUI PR evidence; source examples and model/API flows are not fabricated target objects.
