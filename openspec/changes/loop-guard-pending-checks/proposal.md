# loop-guard-pending-checks

## Why

`gh pr checks <N>` exits 8 while any check is still pending: gh documents it as
*Checks pending*, a state, not an error. The loop guard counts every failed
call, so the third read of a pull request whose checks have not finished warns
of a repeated failure and bars the fourth. On 2026-11-06 two agents, on #426
and #430, stopped reading CI after that warning, although neither was in a
loop (card *loop-guard counts gh pr checks' exit 8 for pending checks as a
failure*, 41039875c31b811180eed2b6d8ea0738).

## What Changes

- The loop guard counts no failure of a Bash call whose command is
  `gh pr checks` with plain words after it — a number, a flag, `owner/name` —
  and whose error's first line is `Exit code 8`. Such a call is neither warned of nor barred, however often it
  is made.
- Every other failure counts as today: `gh pr checks` exiting 1 on a failed
  check, any other exit code, and any command where `gh pr checks` is not the
  whole command — a pipe, a `;`, a substitution, a quote — since its exit code
  is then not necessarily gh's.

Not in this change: a convention to read CI with
`gh pr view <N> --json statusCheckRollup` or `gh pr checks <N> --json …`,
both of which exit 0 while checks are pending. The mechanism holds the case
whichever form an agent picks, where a convention holds it only where it is
read.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `loop-guard`: a new requirement, *A pending checks read is not a failure*;
  *A repeat is the same call failing the same way* names it beside the
  interrupted call.

## Impact

- Changed: `bun/loop-guard.ts` (one test before the count), with cases in a
  new `bun/loop-guard-pending.test.ts`.
- No consumer's tree, settings or registration changes: the guard's hooks
  stay as they are, and the change only takes calls out of its count.
