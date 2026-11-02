# push-skips-proven-gates — tasks

One group, one pull request on `feat/push-skips-proven-gates-1`, under the
800-line budget. Failing cases first, their failure recorded, each cited as
`// spec: <capability>/<slug>`.

## 1. The hook's skip, the step list alone, the foreground runner

- [ ] 1.1 Precondition: `git ls-tree --full-tree --name-only origin/main
      .githooks/gates.sh` lists the file and `harness.bumpTest` in
      `origin/main`'s `package.json` is `bash .githooks/gates.sh` — the group
      of `pre-push-commit-gates` that adds the gates script has merged. If
      not, stop and leave the card where it is. Verify by the two reads
- [ ] 1.2 Failing cases in `bun/push-proven.test.ts`, each running the script
      in a scratch repository with `XDG_STATE_HOME` set to a scratch ledger
      and the ref-update records on standard input: a passing
      `project-checks` record of the pushed sha here exits 0 and prints the
      skip line naming it (`commit-gates/a-head-the-runner-passed`,
      `gate-ledger/a-push-of-a-commit-the-runner-passed`, the ledger's line
      count unchanged); no record exits 1 and prints the reason line naming
      the sha (`a-head-the-runner-did-not-pass`); a passing `diff-budget`, a
      failing `project-checks` and a `push-draft` block of the sha exit 1
      (`another-step-s-pass-at-the-commit`); two records, one proven, exit 1
      (`two-refs-one-unproven`); two proven records exit 0 with a skip line
      naming both, and a proven sha beside a deletion exits 0; a
      top level git cannot read exits 1; a proven sha other than `HEAD` exits 0
      (`a-push-of-a-commit-other-than-head`); only a deletion, and empty
      input, exit 1 (`a-push-that-only-deletes`); an annotated tag's sha
      exits 1 (`a-tag`); a record naming another top level exits 1
      (`another-checkout-of-the-same-commit`); a proven `HEAD` with a
      tracked file edited exits 0 (`a-dirty-tree-over-a-proven-head`); an
      absent ledger and a directory in its place exit 1
      (`a-ledger-the-hook-cannot-read`). Then write `bun/push-proven.ts`
      per design decision 1, reading through `ran()` and writing nothing.
      Verify the cases pass
- [ ] 1.3 Failing cases for the hook: in `bun/pre-pr.test.ts`, the
      order unset, `refs=$(cat)`, the draft check fed `$refs`, the
      skip-or-gates line, the budget last, and the existing pin that the
      hook's text holds no `pre-pr` still passing; in `bun/git-env.test.ts`,
      the stub `bun` exiting 1 for `bun/push-proven.ts` so the existing cases
      still reach `gates.sh`, one case with it exiting 0 in which no gate
      starts and the draft check and the budget still run
      (`commit-gates/a-head-the-runner-passed`), one where `push-proven.ts`
      exits 1 and a stub gate exits 1, failing the hook
      (`commit-gates/a-head-the-runner-did-not-pass`), and one where the draft
      check and `push-proven.ts` both receive the same records on standard
      input (`commit-gates/a-push-into-a-draft`). Then edit
      `.githooks/pre-push` per design decision 1, its comments free of
      `pre-pr`. Verify the cases pass and `bun test` passes
- [ ] 1.4 Failing cases beside `bun/pre-pr-steps-run.test.ts`: `--steps` on a
      code branch prints the one `PRE-PR steps:` line with the code branch's
      steps, runs neither the budget nor `harness.bumpTest` (a stub that
      writes a file shows it never started), and exits 0
      (`pre-pr-runner/the-list-alone`); `--steps B` reads the diff against
      `B` (`the-list-against-a-base`), and `--steps` alone the base
      `bun/diff-base.sh` prints; the ledger gains no line
      (`the-list-writes-no-record`); a dirty tree still prints the list and
      exits 0; with the pull request open the list is the project checks
      alone, unless an existing case already pins that through `--steps`. Then add `--steps` to `bun/pre-pr.ts`
      per design decision 5. Verify the cases pass
- [ ] 1.5 `core/review-toolkit.md`, step 1 of the pre-PR sequence: drop "or
      run it in the background", saying the runner runs in the foreground
      with a 600000 ms timeout; in the paragraph on `PRE-PR steps:`, say
      `bun bun/pre-pr.ts --steps` prints that line alone, running no step and
      recording nothing. `README.md`: `bun/pre-pr.ts [--steps] [<base>]` and
      a row for `bun/push-proven.ts` linking `commit-gates`. Verify by
      reading both back and by `grep -n background core/review-toolkit.md`
      naming no runner line
- [ ] 1.6 Run `bun bun/pre-pr.ts origin/main` on the group's last commit,
      then push with `work.ts finish`. Verify the push prints the skip line
      for that commit and runs no gate
