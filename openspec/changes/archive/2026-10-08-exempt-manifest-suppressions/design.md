# exempt-manifest-suppressions — design

## Context

`scan()` in `bun/no-suppressions.ts` lists tracked files at the repository root
and skips two kinds: prose (`PROSE`) and the check's own script and test
(`self(root)`). The allowlist is read from the root `package.json` through
`bun/config.ts`'s `read`, which parses it with `JSON.parse`. The motivation is
in `proposal.md`'s *Why*, and the behaviour in the `commit-gates` delta.

## Decisions

### Exempt the root manifest by path, not its allowlist's keys

Two ways were weighed during the explore:

| | A: subtract the keys | B: exempt the file |
| --- | --- | --- |
| What it does | parse the manifest, count markers in `harness.suppressions` keys, subtract them from the text count | skip the root `package.json` the way `self()` skips the script and test |
| Open question it raises | does a `why` that names a marker count? | none |
| What it still scans | a file where a marker can only sit in a string | nothing new |
| Size | a parser walk plus a subtraction, and its own failure modes | one path in the skip |

B is chosen. A scans a file for a construct the file cannot hold: `read` parses
the manifest with `JSON.parse`, so a comment in it would throw before any gate,
the scan included, got far enough to report. Everything A keeps scanning is
therefore inside a string, and a string suppresses nothing.

The skip is the path `package.json` relative to the root, because `git ls-files`
is run at the root and names files from there. That matches the manifest `read`
opens and nothing below it, which keeps workspace manifests scanned as the
delta requires.

### State the exemption in the scan

The new skip sits beside `PROSE` and `self` with its reason in a comment, per
the rule that a scan states its own exemptions. The module's header comment,
which today names prose as the only exemption besides the check itself, is
re-read and updated in the same edit.

## Risks / Trade-offs

- [A future harness key in the manifest holds code that really could carry a
  suppression] → It cannot while the manifest is strict JSON. If `read` ever
  accepts a JSONC manifest, the reason in the comment stops holding. The
  comment names `JSON.parse` so whoever changes `read` sees the dependency.
- [Consumers keep dead `package.json <marker>` entries after re-pinning] → They
  fail nothing. Removing them is the consumer's step (proposal *Non-goals*).

## Migration Plan

Consumers pick it up with their next re-pin. Rollback is a revert: consumers that
removed their `package.json` entries would then fail until they restore them.
