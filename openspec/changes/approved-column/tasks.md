## 1. The tenth status

- [ ] 1.1 Add `approved` to `bun/board-state.ts`'s header among the statuses
      it never reports, and to the hand-moved list in
      `bun/board-state.test.ts`'s case *no key carries any of the six
      statuses moved by hand* (renamed to seven). Verify with
      `bun test bun/board-state.test.ts`
- [ ] 1.2 In `core/feature-workflow.md`, count ten statuses, three derived and
      seven by hand, and say that only the user moves a card to `approved`,
      and that a session the user directs at an `idea` card may move it to
      `exploring` directly. Verify with the tests that read
      `core/feature-workflow.md`
- [ ] 1.3 Set the `Status` select of `Harness` and `D2ASS` to the ten options
      in order through the connector's DDL, then re-read each board's schema
      and compare it with the list; record the read-back in the pull request.
      `mellon` takes the list when it is provisioned. Verify by the read-back
