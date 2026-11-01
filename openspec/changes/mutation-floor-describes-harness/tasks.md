# mutation-floor-describes-harness — tasks

One group, one pull request. No code changes: the check already behaves as
the modified requirement says, so no failing case comes first.

## 1. The spec describes the harness

- [ ] 1.1 Confirm `pre-push-commit-gates` is archived on `main` and
      `package.json` declares `harness.mutationFloor`. Verify with
      `git ls-tree --full-tree --name-only origin/main openspec/changes/archive/`
      naming a `*-pre-push-commit-gates` directory and `grep -n
      '"mutationFloor"' package.json` naming the key; if either is missing,
      stop and leave this change unarchived
- [ ] 1.2 Confirm the three cases citing this requirement's scenarios still
      cite them. Verify with `grep -n "spec: mutation-floor/" bun/*.test.ts`
      naming `a-branch-added-without-a-test`, `a-survivor-newly-killed` and
      `the-floor-changed-with-no-reason-given`, and `bun test
      bun/mutation-floor` green
- [ ] 1.3 Archive the change, then rewrite the Purpose of
      `openspec/specs/mutation-floor/spec.md` with the editing tool to say
      what the floor check counts and forbids wherever it runs, and what the
      harness mutates — no `src/model.ts`. Verify with `grep -n "src/model\|FLOOR"
      openspec/specs/mutation-floor/spec.md` printing nothing and `openspec
      validate mutation-floor --type spec` passing
