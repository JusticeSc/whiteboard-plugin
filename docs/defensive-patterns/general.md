# Defensive patterns

English | [中文](general.zh.md)

Hard-won bug-class rules: each pattern below is a class of defect that actually shipped or nearly shipped in the source project, stated as the rule that prevents its recurrence. Read this before changing generation, fetching, caching, output writing, error handling, or teardown. Test-tier counterparts (real entry path, world-verification, resource ownership) are in [testing.md](../testing.md).

## Report orthogonal outcomes independently

A result can be several things at once — a process can time out AND exit 0 because it trapped the signal. Surface each independent fact (`timedOut`, `signal`, `exitCode`) on its own; never nest one flag's report inside another's branch, or a caller reads a cut-short run as a clean success.

The judged condition is whether each fact can be true independently and is readable without entering another condition's branch. The boundary is the report; how the process is signalled or how long it is given is a separate decision.

## Timing does not carry correctness

Correctness comes from explicit call points and explicit state, never from where a callback lands in the event loop. A `microtask`, `setTimeout`, or `queueMicrotask` that decides whether work is correct races the rest of the program: it holds under light load and silently fails under a busy one or when batching changes.

The judged condition is whether correctness depends on "that callback already ran" instead of on a named call point or state machine. A test's timeout budget waits for a failure and is not timing-dependent correctness; a deliberate delay that only paces output is not this rule.

```ts
// The order is written into the code: close the old store, then build its successor.
declare let store: { close(): void }
declare function createStore(scopeKey: string): { close(): void }
declare const scopeKey: string

store.close()
store = createStore(scopeKey)
```

```ts ignore-check
queueMicrotask(() => { if (!ready) refresh() })   // assumes the microtask runs before the next frame
setTimeout(() => setReady(true), 0)                // waits for a render that was never sequenced
```

## Optional inputs state both behaviors

An optional parameter states what the callee does when it is present and when it is absent, so a caller reads both behaviors from the contract instead of inferring one from a defensive operator. Accumulating `?.` is the signal: each one substitutes for a decision about whether the field should exist at all.

The judged condition is whether `?.` replaces a determination that a field exists rather than handling a genuinely optional hop on a known value. The contract states both branches and their side effects; a call site that cannot state both behaviors is a review blocker, not a style preference.

```ts
interface ResolveInput { options?: readonly string[] }
type Resolution = { kind: 'unknown' } | { kind: 'value'; value: string }

// Both behaviors are in the contract: no options means "unknown", not "skip".
function resolve(input: ResolveInput): Resolution {
  if (input.options === undefined) return { kind: 'unknown' }
  return { kind: 'value', value: input.options.join(',') }
}
```

```ts ignore-check
const value = a?.b?.c?.d ?? fallback   // four layers of fallback hide whether d should exist
```

## One value states one fact

An unknown value, an empty collection or string, and a genuinely absent field are three different facts and take three representations. One `undefined` or `null` never stands for several of them, and a consumer that must act differently on each discriminates explicitly instead of collapsing them at the boundary.

The judged condition is whether a single "no value" carries more than one semantic: not yet queried, queried and empty, and cannot be determined. A discriminated union or an explicit enum value is the ordinary implementation.

```ts
type ValueState<T> = { kind: 'unknown' } | { kind: 'empty' } | { kind: 'value'; value: T }
```

```ts ignore-check
return null   // means "not queried", "queried, nothing there", and "cannot tell", all at once
```

## Shared state has one owner

Shared state hangs on an object with a lifecycle, so its owner is named. A module-level cache, singleton, `globalThis` field, or `Symbol.for` key hides that owner and outlives every teardown.

The judged condition: name the object that owns the value; if no owner can be named, decide the owner before implementing. A field on an instance may be read by any number of consumers, and passing that value across domains goes through the existing interface rather than a global namespace. A genuine need for a global lookup key goes to the domain owner together with its reclamation policy.

```ts
// The cache hangs on the generator run; consumers receive it explicitly.
interface RunCache { get(key: string): string | undefined }
declare const cache: RunCache

const cached = cache.get('registry:@scope/example')
```

```ts ignore-check
globalThis.__cache = new Map()   // shared across runs, reclaimed never
```

## Migrations preserve behavior

A migration or a package split keeps externally observable behavior equal: error codes, diagnostics, data-flow order, and output bytes are compared item by item. Moving code is preferred over deleting and rewriting it; a rewrite suits code whose semantics are changing anyway, and then the change lists its differences. A package or export-path change is a carrier change rather than a behavior change, and a behavior change is its own change.

The judged condition is the item-by-item comparison of observable behavior before and after. Where full equality is impossible, the change states the differing items and how each is verified. A defect found during a migration is fixed as its own change rather than folded into the move.

```sh
# The move keeps paths and exit codes; the reference updates are the whole diff.
git mv apps/old/src/fetch.ts apps/new/src/fetch.ts
```

```ts ignore-check
// The migration silently upgrades the error handling it was only supposed to move.
throw new Error('not found')   // was: return { ok: false, code: 'not_found' }
```

## Dispose must reach quiescence, not just request it

Await child exit after killing or aborting. Optional notifications may stop early; resources and listeners needed for completion or final persistence must survive until consumers settle.

The judged condition is whether teardown awaits actual quiescence or only requests it. The boundary is work with no owner to await — a detached, unobserved task — which teardown is not obliged to track; anything the component started and can still observe must be awaited before it reports completion.

## Contain callback exceptions in the dispatcher

Catch and report each listener's exception without rejecting the dispatch promise or starving later listeners. The listener's owner must handle state it mutates under the error-handling rules; catching alone does not restore state.

The judged condition is whether a throwing listener can reject the dispatch promise or prevent later listeners from running. The boundary is the caller's own await: an error the dispatcher deliberately propagates to the operation that requested it is not a containment failure.

```ts
async function dispatch(listeners: ((event: string) => Promise<void>)[], event: string): Promise<void> {
  for (const listener of listeners) {
    try { await listener(event) } catch (error) { console.warn('listener failed', error) }
  }
}
```

## Never hand untrusted output the ambient environment or predictable paths

Spawned commands get a scrubbed environment (drop `*KEY*`/`*SECRET*`/`*TOKEN*`/`*PASSWORD*`) so credentials cannot leak into output, `env`, or spill files. Temporary and cache files use a private directory, random names, and exclusive owner-only opens (`'wx'`, `0o600`); predictable world-readable paths invite symlink races and disclosure.

The judged condition is whether spawned processes inherit the ambient environment or write somewhere another process can predict and replace. The boundary is trusted in-process code with no external input, which the rule does not govern.

## Unlink link-shaped paths

A path that may be a symlink or Windows junction is removed with `lstatSync().isSymbolicLink()` then `unlinkSync`: unlink deletes only the link and refuses a real directory, so it never follows the link into its target. Windows `rmSync(link)` throws `ERR_FS_EISDIR` on a junction; recursive deletion may descend through one into its target. Reserve recursive `rmSync` for known real directories.

The judged condition is whether the removal primitive can follow a link into its target. The boundary is a path the code created itself in a directory it owns, where a plain recursive removal is already known to be safe.

## Bound the complete result

Apply byte, count, and time limits where the complete emitted or retained value, including wrappers and metadata, is known. Test a tiny limit, the exact limit, one oversized item, and multibyte byte counts. A limit on an inner payload that ignores its envelope lets the total exceed the declared bound.

The judged condition is whether a caller can construct a result larger than the documented maximum without triggering the bound. The boundary is a value the component neither emits nor retains, which its own bound does not govern.
