# ci-flow-draft — tasks

One group, shipped whole on `feat/ci-flow-draft`. Write each failing case
first and record that it fails; cite each scenario as
`// spec: orchestrator/<slug>`. `bun/ci-run.ts` stands at 296 lines: the
toggle goes in a module of its own.

## 1. Draft while the CI flow works, ready once it ends

- [x] 1.1 Failing cases in `bun/ci-run.test.ts`, the `gh` stub recording
      every call and the bare origin's `post-receive` hook recording the
      push: the draft is made before the session, ready follows the push
      of a fix, ready follows `fixed` with no new commit and `flaky` with no
      push, and `blocked` leaves the draft; a `gh` that refuses `pr ready`
      after a push is exit 1 naming #7, the push kept. Recorded failing:
      5 of 63
- [x] 1.2 Add `draftWhile()` in `bun/ci-run-draft.ts`; `resume()` answers
      whether the session answered `blocked`, and `decide()` wraps it. The
      two cases that pinned `gh` to the log read alone now allow the toggle.
      Verify with `bun/ci-run.test.ts` and `bun/on-event.test.ts`
- [x] 1.3 Drop "The runner does not follow this" from
      `core/git-and-prs.md`'s PR bullet
