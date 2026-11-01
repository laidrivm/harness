# mutation-floor-describes-harness — tasks

One group, one pull request. The one code change is task 1.4 (design.md,
decision 5), whose failing cases come first.

## 1. The spec describes the harness

- [ ] 1.1 Confirm `pre-push-commit-gates` is archived on `main` and
      `package.json` declares `harness.mutationFloor`. Verify with
      `git ls-tree --full-tree --name-only origin/main openspec/changes/archive/`
      naming a `*-pre-push-commit-gates` directory and `grep -n
      '"mutationFloor"' package.json` naming the key; if either is missing,
      stop and leave this change unarchived. Open at apply (2026-11-01):
      neither was on `main` yet, so this box waits for
      `pre-push-commit-gates`' archive
- [x] 1.2 Confirm the three cases citing this requirement's scenarios still
      cite them. Verify with `grep -n "spec: mutation-floor/<slug>$"
      bun/*.test.ts` printing a line for each `<slug>` of
      `a-branch-added-without-a-test`, `a-survivor-newly-killed` and
      `the-floor-changed-with-no-reason-given` — one grep per slug, since a
      grep on the prefix alone passes with any of them gone — and `bun test
      bun/mutation-floor` green
- [x] 1.3 Write the new Purpose of `openspec/specs/mutation-floor/spec.md`
      into `design.md`, under decision 2, with the editing tool: what the
      floor check counts and forbids wherever it runs, and what the harness
      mutates — no `src/model.ts`. Verify by reading the section back: it
      names neither `src/model.ts` nor a floor constant
- [x] 1.4 Make `gauge` name the field for an absent `why` and a `surviving`
      that is not a whole number (design.md, decision 5): first add cases to
      `bun/mutation-floor.test.ts` for an absent, empty, blank or non-text
      `why`, and a `surviving` that is a string, absent or a fraction — the
      last under `// spec: mutation-floor/a-floor-that-is-not-a-whole-number`
      — each expecting one problem naming its field, and see the absent `why`
      throw and the floors fail; then change `gauge`. Verify with `bun test
      bun/mutation-floor` green

The archive runs separately, once every box above is ticked (design.md,
decision 2): in the commit that syncs the delta it copies that Purpose into
`openspec/specs/mutation-floor/spec.md`, then checks that `grep -n
"src/model\|FLOOR" openspec/specs/mutation-floor/spec.md` prints nothing and
`openspec validate mutation-floor --type spec` passes.
