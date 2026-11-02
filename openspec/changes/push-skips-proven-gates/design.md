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
non-deletion record, takes the top level from `root` in `bun/root.ts` (`ran()`
compares the record's project exactly), reads the ledger once and hands its
text to each `ran()` call, and exits 0 with the skip line when there is at
least one sha, no record's remote ref lies under `refs/tags/`, a deletion's
included — a lightweight tag's sha is its commit's, so the sha alone cannot
tell it, and a push that deletes a tag beside a proven branch still touches
one — and each sha has
a `pass` and no `fail` or `error` (decision 3); otherwise it prints the reason
line and exits 1. A torn ledger line counts as no record, as it does for every
`ran()` reader: the ledger is never rotated, so refusing the skip over one torn
line anywhere in it would refuse it for good. Any other exit, `root.ts`
throwing outside a repository included, also runs the gates, so a broken
reader costs time, never a check; bun missing fails the draft check first,
which stops the push. Under `set -e`, a gate failing on the
right of `||` still fails the hook.

The records are parsed in one place: a small module (`bun/push-refs.ts`)
splits standard input into `{ sha, ref, deletion }` for each record, a
deletion kept and flagged so its remote ref still reaches the tag check, and
`bun/push-draft.ts` switches to it in the same change, so the draft check and
the skip never read different shas from one input.

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
consumes no ref-update records describes its gates (Risks).

The record proves the gates of the commit's own tree: a commit that narrows
`harness.bumpTest`, or an older tip recorded before `gates.sh` gained a step,
is proven by what it holds. That is what the hook's gates would judge too had
the commit been checked out, and the narrowing is in the diff CI and the
reviewer read.

### 3. Any failure of the commit runs the gates

A `fail` or `error` record of `project-checks` for the sha in this checkout
runs the gates, whatever passed before or after. A pass and a failure of one
commit is either a flake or a gate whose tool one shell had and another did
not — `gitleaks` behind `command -v` — and the second must not be pushed
past. This is stricter than `finish`, which takes any pass; it fails toward
running, and costs one more run only where a failure was seen. Three `ran()`
calls over the one ledger text decide it, with no new reader.

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
is taken out of the arguments wherever it stands, before the base and the
budget's arguments are read, so `pre-pr.ts origin/main --steps` is the list
too and never a full run with the flag passed on to the budget.

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
- [A run outlasts the 600000 ms timeout — #392's took 610 s, and `gates.sh`
  adds to it] → the user's answer keeps the foreground call with that
  timeout. The Bash tool moves a call that reaches its limit to the
  background and notifies on exit rather than killing it, so step 1 says to
  wait for that notification in the same turn and never to start the runner
  with `&` or a second time. Not measured on a 600 s run.
- [The main spec's *The pre-push hook runs the gates named here* says the
  hook SHALL run its gates and "does not consume the ref-update records"; the
  draft-check requirement already contradicts the second, and this change
  adds a skip and a second reader] → that requirement cannot be MODIFIED here
  without clashing with `pre-push-commit-gates`' delta of it, which archives
  after this change and would write the text back. The added requirement
  names itself the one exception to it, so the two read together, and the
  rewording is handed to `pre-push-commit-gates`' delta in this pull
  request's body: its opening as "Unless the hook skips the gates a passing
  run record proved (*The pre-push hook skips the gates a passing run record
  proved*), the pre-push hook SHALL run…", and "Its gates do not consume the
  ref-update records".
- [`pre-pr.ts` trims its top level with `trimEnd()`, `root.ts` strips only
  git's newline] → a checkout whose path ends in a space gets no match and
  runs the gates: slower, never unchecked.
- [Reading a ledger that is never rotated] → about 0.5 MB and 1800 lines on
  the laptop today; one parse plus bun's start, estimated well under a second
  and not measured. `gate-ledger.ts`'s `ponytail:` note already names
  rotation.

## Migration Plan

One pull request. Rollback is reverting it; the hook then runs its gates on
every push as before.
