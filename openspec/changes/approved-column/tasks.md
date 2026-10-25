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
- [ ] 1.3 **User act.** Add `approved` to the `Status` select of each of the
      three boards under `hpr` — `Harness`
      (`collection://3cd39875-c31b-80d9-929d-000b8ddd8190`, page
      https://app.notion.com/p/3cd39875c31b8071bff6d016eb77f6bf), `D2ASS`
      (`collection://3cd39875-c31b-8010-9ec0-000baae4b261`, page
      https://app.notion.com/p/3cd39875c31b8050bb14c7035f5f4f87) and `mellon`
      (`collection://db99880a-f574-4e24-910e-b4dd40d6f47f`, page
      https://app.notion.com/p/302507ea91d6423b9ecc9e39ab16d8b1) — by hand,
      on each board in turn:
      1. open the board's page and any table view of it;
      2. click the `Status` column's header, then *Edit property*;
      3. click *Add an option*, type `approved` exactly, lower case, and press
         Enter;
      4. click the new option to open its menu and pick the colour *Red*,
         the one colour the nine options leave unused;
      5. drag the option by its `⋮⋮` handle to sit second, between `idea` and
         `exploring`, so the list reads `idea, approved, exploring, explored,
         proposing, proposed, applying, applied, archiving, done`;
      6. rename, delete or recolour no other option;
      7. open `Board view`: where the `approved` column shows at the end or
         under *Hidden groups*, drag it between `idea` and `exploring` and
         show it.
      Then tell the apply session, which re-reads each board's schema and
      compares its `Status` options, names and order, with the list above,
      stops on a difference, and records the read-back in the pull request
      (design, *Settled with the user*). Verify by the read-back. The user
      reported the option added on all three boards on 2026-10-25 (item 10
      on the `bot-notion-writes` card); the read-back stays
