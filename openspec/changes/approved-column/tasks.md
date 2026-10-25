## 1. The tenth status

- [x] 1.1 Add `approved` to `bun/board-state.ts`'s header among the statuses
      it never reports, and to the hand-moved list in
      `bun/board-state.test.ts`'s case *no key carries any of the six
      statuses moved by hand* (renamed to seven). Verify with
      `bun test bun/board-state.test.ts`
- [x] 1.2 In `core/feature-workflow.md`, count ten statuses, three derived and
      seven by hand, and say that only the user moves a card to `approved`,
      and that a session the user directs at an `idea` card may move it to
      `exploring` directly. Verify with the tests that read
      `core/feature-workflow.md`
- [x] 1.3 Set the `Status` select of `Harness`
      (`collection://3cd39875-c31b-80d9-929d-000b8ddd8190`), `D2ASS`
      (`collection://3cd39875-c31b-8010-9ec0-000baae4b261`) and `mellon`
      (`collection://db99880a-f574-4e24-910e-b4dd40d6f47f`), the three boards
      under `hpr`, to the ten options in order through the connector's DDL,
      then re-read each board's schema and compare it with the list; record
      the read-back in the pull request; the apply session makes this write,
      under the bot integration's name, once the change that routes card
      writes through the bot has landed (design, *Settled with the user*). Verify by the read-back
