# Translation rules

English | [中文](translation-rules.zh.md)

These rules govern updates to existing English and Simplified Chinese governance pairs. Both languages carry equal authority under the [pairing rules](README.md). Either side may be authored first; the author updates the counterpart in the same change. MUST and MUST NOT are review requirements, SHOULD needs a reason to deviate, and MAY is discretionary. No automated translation gate is installed.

## Faithfulness

- The counterpart MUST preserve every behavior, prerequisite, warning, version claim and example. If the pair disagrees, fix the side that conflicts with the owning facts, then update the other; neither language wins by default.
- The counterpart SHOULD read as natural technical writing in its language, not a word-by-word gloss. Preserve meaning and register when restructuring sentences.
- Translate an idiom's meaning rather than its literal wording when a literal translation would mislead.

## Voice

- Use concise professional technical prose. Calibrate register against the closest [style sample](style-samples.md); terminology, faithfulness and structure take precedence. A source sample is not this plugin's runtime contract.
- Preserve each actor, condition, obligation, exception and consequence. Fluency does not justify dropping a clause.
- Make the actor explicit when the target language would otherwise obscure who acts.
- Prefer established engineering terms and natural explanations over calques or translated noun chains.
- Keep one idea per paragraph and one physical line per paragraph. A translation may split a paragraph when its grammar needs it.
- Use conventional English category names in English prose. In Chinese prose, give an English annotation on first use when the terminology table requires it. Literal paths remain unchanged.

## Structure preservation

Review both files directly; there is no structure-signature checker. A pair MUST preserve:

- heading hierarchy and order, with translated heading text;
- list shape, ordering and numbering;
- table columns and row order, with translated prose cells;
- byte-identical fenced code blocks, including comments and info strings;
- verbatim inline commands, flags, configuration keys, paths, event and API names, and versions;
- equivalent link targets with exact query and fragment suffixes. Use the matching language when the target has a counterpart, and retain the path for single-language targets. External URLs and images remain unchanged. The language switcher deliberately crosses languages.

Relative links and fragments must resolve. Keep exactly one trailing newline. Documentation snippets are not automatically compiled or typechecked; verify runnable examples through the actual owner when they change.

## Terminology

- Read [terminology](terminology.md) before translating. Follow each row's rendering, first-use annotation and prohibited alternatives. English targets use the English column without adding a Chinese gloss.
- An unlisted Chinese technical term MAY use an established rendering from a major Chinese-language OSS or vendor source, cited in review. Otherwise keep the English term and report the proposed rendering as pending.
- Use the established English technical term in an English target. If the source has no clear equivalent, retain it with a short explanation and report it as pending. Add an agreed term to the glossary rather than inventing a local alternative.

## Typography

Chinese prose follows the mixed-script conventions of the [MDN translation guide](https://github.com/mdn/translated-content/blob/main/docs/zh-cn/translation-guide.md), [Kubernetes localization guide](https://kubernetes.io/zh-cn/docs/contribute/localization_zh/), [Vue.js translation conventions](https://github.com/vuejs-translations/docs-zh-cn/wiki/%E7%BF%BB%E8%AF%91%E9%A1%BB%E7%9F%A5), and [Chinese copywriting guidelines](https://github.com/sparanoid/chinese-copywriting-guidelines):

- Put one half-width space between Chinese text and Latin words or numerals; do not add spaces beside full-width punctuation.
- Use full-width Chinese punctuation in Chinese prose. Keep half-width punctuation inside code, verbatim English quotations and numbers.
- Prefer periods, commas, colons or parentheses over em dashes unless an em dash expresses the meaning more naturally.
- Use enumeration commas for parallel Chinese items.
- Use half-width digits and Latin letters.
- Preserve canonical proper-noun casing and exact code spelling.
- Address the reader as 你 rather than 您.
- Keep emphasis on equivalent spans; do not replace emphasis with decorative quotation marks.

## Quality bar

- A bilingual engineer reading either file alone must receive the same facts, caveats and meaning, with no added claim.
- Compare the pair clause by clause, then review structure, terminology, links, code and typography. Report manual review and actual commands separately; do not invent hash confirmation, automated checks or human approval.

## References

The [W3C Chinese layout requirements](https://www.w3.org/TR/clreq/) and [Microsoft Simplified Chinese style guide](https://learn.microsoft.com/en-us/globalization/reference/microsoft-style-guides) provide further typographic and localization guidance. Use the [pairing rules](README.md) for scope, exclusions and the manual update workflow.
