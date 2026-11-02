# push-skips-proven-gates — design

## Context

See proposal.md — Why. The explore of 02.11 (on the card, against main
`9484a657` and `pre-push-commit-gates`' design) found:

- `bun/pre-pr.ts` writes no record while any file differs from `HEAD`,
  untracked ones included, or when `HEAD` moved during the run. A `pre-pr`
  record of `project-checks` therefore proves the clean tree of the commit it
  names, and that commit's own `harness.bumpTest` — after `pre-push-commit-gates`'
  gates-script group, `bash .githooks/gates.sh`, the script the hook runs.
- `ran(sha, top, "pass", undefined, "project-checks")` in
  `bun/gate-ledger.ts` already reads that record for `work.ts finish`, the
  turn gate and the goal check, matching gate, rule, commit, project and
  decision; an unreadable ledger or a torn line matches nothing.
- Git hands the hook one line per ref on standard input, `<local ref> <local
  sha> <remote ref> <remote sha>`; a deletion's local sha is all zeros, an
  annotated tag's is the tag object's. Today `bun bun/push-draft.ts "$@"`
  reads all of it.
- `bun/pre-pr.test.ts` pins the hook in two ways that this change meets:
  `'bun bun/push-draft.ts "$@"'` as an exact line, ordered after the unset
  and before the gates, and the hook's whole text, comments included,
  containing no `pre-pr` (*pre-pr-runner*, *A push*). `bun/git-env.test.ts`
  runs the hook with a stub `bun` that exits 0 for every call.

## Goals / Non-Goals

**Non-Goals:** recording the skip in the ledger — no reader asks for it, and
the skip line shows in the push's output; a base in the record (below); a
consumer's hook; changing what `gates.sh` runs.

## Decisions

### 1. The hook reads the ledger itself (option В on the card)

```sh
unset $(git rev-parse --local-env-vars)
refs=$(cat)
printf '%s\n' "$refs" | bun bun/push-draft.ts "$@"
printf '%s\n' "$refs" | bun bun/push-proven.ts || bash .githooks/gates.sh
bash bun/diff-budget.sh || true
```

`bun/push-proven.ts` (about 20 lines) takes the local sha of every
non-deletion record, reads the top level with `git rev-parse --show-toplevel`
as `work-finish.ts` does (`ran()` compares the record's project exactly), and
exits 0 with the skip line when there is at least one sha and `ran()` finds a
pass for each; otherwise it prints the reason line and exits 1. Any other
exit, bun missing included, also runs the gates, so a broken reader costs
time, never a check. Under `set -e`, a gate failing on the right of `||`
still fails the hook.

The lines read, for example:

```text
pre-push: gates skipped — a passing pre-PR record of project-checks names 9484a65 here; bash .githooks/gates.sh runs them by hand
pre-push: running the gates — no passing pre-PR record of project-checks for 9484a65 here
```

The name `push-proven` and the lines stay in the script, not the hook,
because the hook's text may not contain `pre-pr`.

Alternatives: `finish` passing the proven sha in a variable — the same code,
covering only `finish`, and a second channel of evidence that any shell can
set and the ledger never sees; dropping the checks from `pre-pr.ts` — breaks
`finish`, the turn gate and the goal check, which read its record, and the
host's push clone, which pushes without a hook; `--no-verify` from `finish` —
forbidden, and would drop the draft check too.

### 2. No clean-tree condition, no comparison with `HEAD`

The record already proves the commit's clean tree, and uncommitted files are
not pushed. A push of a sha other than `HEAD` is judged by that sha's record,
which is more exact than today's gates, which judge the working tree. The
gates, when they run, still judge the working tree, as *The pre-push hook
runs the gates named here* says; that requirement's paragraph saying the hook
consumes no ref-update records describes its gates and is left to
`pre-push-commit-gates` to word.

### 3. A pass followed by a failure still skips

`ran()` takes any passing line, as `finish` does; a flaky suite that passed
once is rerun by CI on the pull request. Requiring the latest record to pass
would make the hook stricter than `finish`, which pushed nothing more.

### 4. The base is not recorded

`pre-push-commit-gates` has `gitleaks` scan `<base>..HEAD`, the base from
`HARNESS_BASE`, which `pre-pr.ts` sets to its argument; the hook leaves it
unset and gets `origin/main`. A runner given another base proves another
range. That is the same gap as a machine without `gitleaks`, and it closes
the same way: CI scans the whole history. The mutation step reads no base.

### 5. `--steps` in `pre-pr.ts`, not a second entry point

`bun bun/pre-pr.ts --steps [<base>]` resolves the base and the pull request
state exactly as a full run does, prints the last line and exits 0, before
the budget, the checks and the record. A separate `main` in
`bun/pre-pr-steps.ts` would copy both reads, and two copies drift. The flag
comes first, so `pre-pr.ts origin/main` keeps its meaning.

### 6. No `after:`

`bun/board-state.ts:197` counts an `after:` entry as blocking until that
change's status is `done`, that is archived. `pre-push-commit-gates` archives
after its mutation group, so naming it would hold this change past the point
the user chose. The order lives in proposal.md and in task 1.1.

## Risks / Trade-offs

- [A forged ledger line skips the gates] → The ledger is unprotected by
  decision (stage 2, decision 23); a forged line yields an unchecked push,
  not a merge: CI's required checks run on the pull request. `finish`, the
  turn gate and the goal check already trust the same line.
- [The stub `bun` in `bun/git-env.test.ts` exits 0, so every existing case
  would skip the gates] → the stub exits 1 for `bun/push-proven.ts`, and one
  new case has it exit 0 and asserts no gate starts.
- [Reading a ledger that is never rotated] → about 0.5 MB and 1800 lines on
  the laptop today; one parse plus bun's start, estimated well under a second
  and not measured. `gate-ledger.ts`'s `ponytail:` note already names
  rotation.

## Migration Plan

One pull request. Rollback is reverting it; the hook then runs its gates on
every push as before.
