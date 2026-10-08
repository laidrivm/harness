# exempt-manifest-suppressions

## Why

`bun/no-suppressions.ts` reads every tracked file except prose and its own
script and test, and the consumer's root `package.json` is one of those files.
The allowlist lives in that same file: every approval is a key of
`harness.suppressions` spelled `<path> <marker>`, so each approval is itself
counted as a suppression in `package.json`. A consumer with any approval has to
approve `package.json <marker>` as well, and that entry's own key is one more
occurrence. The count reaches a fixed point only because it counts itself.

mellon carries exactly that today, on the harness pin `dbbea02`, whose scan is
identical to `HEAD`'s:

| `harness.suppressions` key | count | what it approves |
| --- | --- | --- |
| `src/api/config.ts biome-ignore` | 1 | a real suppression |
| `src/index.ts biome-ignore` | 3 | real suppressions |
| `src/app/components/Header.tsx @ts-expect-error` | 1 | a real suppression |
| `package.json biome-ignore` | 3 | the three `biome-ignore` keys, its own included |
| `package.json @ts-expect-error` | 2 | the two `@ts-expect-error` keys, its own included |

The last two rows are noise that every new approval has to bump. They also teach
the reader that an allowlist entry can be about anything, which is the opposite
of what the check exists to show.

## What Changes

- `bun/no-suppressions.ts` stops scanning the consumer's root `package.json`,
  next to the exemptions it already states (prose, and its own script and test),
  and names the reason in the scan. A marker there cannot suppress anything:
  `bun/config.ts` reads the file with `JSON.parse`, which rejects a comment, so
  a marker in the file can only sit inside a string and every gate would fail
  before the scan ran.
- `package.json` files below the root (workspace manifests) stay scanned. The
  exemption follows the file that holds the allowlist, not the file name.
- `openspec/specs/commit-gates` §*Linter and type-checker suppressions fail CI*
  adds the root manifest to the scan's exemptions, with its reason, and gains a
  scenario for an allowlist whose keys name markers.

Measured during the explore by filtering the root `package.json` out of
`scan()`'s result rather than changing the code: on mellon's tree, with the two
`package.json` entries removed, the scan returns no findings, and the three
real approvals still count. On dota2's `origin/main` the allowlist is empty and
no tracked file other than prose carries a marker, so the exemption changes
nothing there.

## Non-goals

- **Editing a consumer.** mellon's re-pin and the removal of its two
  `package.json` entries are on the mellon board's card *Run harness:check in
  pre-push and CI*, and so is wiring `harness:check` into its CI and hook.
- **Reporting unused approvals.** After this change mellon's two
  `package.json` entries approve nothing, and the scan does not say so. A
  failure on an entry whose count exceeds its findings would also catch a
  suppression approved before it was written. That is a tightening of its own,
  and it would fail mellon until mellon drops those entries, so it cannot
  ship first.
- **Parsing the manifest to skip only the allowlist's keys.** The other route
  considered: read `harness.suppressions` and subtract the markers in its keys.
  It would have to decide whether a `why` that names a marker counts, and it
  keeps scanning a file in which no marker can suppress anything. `design.md`
  records the comparison.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `commit-gates`: the suppression scan's exemptions add the consumer's root
  `package.json`, the file its allowlist lives in, with a scenario for an
  allowlist whose keys name markers.

## Impact

- `bun/no-suppressions.ts`: one more exemption and its comment.
- `bun/no-suppressions.test.ts`: cases for the root manifest and a workspace
  manifest.
- Consumers: none until they re-pin. After the re-pin, `package.json <marker>`
  entries become dead and can be removed. Leaving them in place does not fail
  anything.
