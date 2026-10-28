# notion-status-gate — tasks

Groups 1 and 2 are a pull request each, `feat/notion-status-gate-1` then
`-2`, after `work-finish` group 2 merges (proposal, *Order*); group 3, the
probe after the pin bump, is ticked in the pull request that records it. Each failing
case first, its failure recorded, cited as `// spec: work-status/<slug>`.
The Notion stand-in is `bun/notion-bot.fixture.ts`'s `standIn()`, given a
`select`-typed `Status` on the page it answers and the page a `PATCH`
answers with; the repositories are a bare `origin` and a clone from
`bun/diff-budget.fixture.ts`'s `emptyDir`, with `GIT_*` stripped as the
suite's preload requires.

## 1. `work.ts status`

- [x] 1.1 Failing cases in `bun/work-status.test.ts` for the arguments: no
      arguments, `--card` alone, `--to` alone, `--to merged`, a positional,
      an unknown option and a 31-hex card each print the usage and exit 2
      with no stand-in call and no `git` run; `--to idea`, `approved` and
      `discarded` exit 1 with no stand-in call and one `status` record under
      `user-only`; a card reading `discarded` refuses any `--to` after the
      page read alone. Then add the `status` subcommand to `bun/work.ts`
      and its usage line, and `bun/work-status.ts` with the checks so far
- [x] 1.2 Failing cases in the same file for the WIP limit, each with the
      page read and the query asserted on the stand-in: from `approved`, five
      cards in the range refuse under `wip-full`, four write; from `idea` the
      same (the directed-session scenario); from `proposing` to `proposed`,
      from `approved` to `done`, and from `approved` to a `proposed` that
      `origin/main` proves (with 1.3's fixture), no query is made;
      `HARNESS_WIP_LIMIT=2` with two cards refuses, `five`, `-1` and `5x`
      refuse under `wip-limit`; the query's filter names exactly the seven
      range statuses and the card's `data_source_id`; `has_more` refuses
      under `HARNESS_WIP_LIMIT=150`. Then the count
- [x] 1.3 Failing cases in `bun/work-status-tree.test.ts`, with a bare
      `origin` whose `main` the test advances after the clone: a change
      archived on `origin/main` and not in the clone's tree or local `main`
      proves `done`, in a clone made with `--single-branch` of a feature
      branch too; a commit in the clone archiving a change `origin` lacks
      refuses `done` under `no-evidence` with the `origin/main` SHA in the
      record; an `origin` that cannot be fetched refuses under `unread`; a
      change without `design.md` on `origin/main` refuses `proposed`; a
      complete change proves `proposed`; groups 1 ticked and 2 open refuse
      `applied` naming group 2; every group ticked, one task reading
      `Dropped: …`, proves `applied`; a `tasks.md` with no boxed group, or
      an open group and a ticked one under the same `## ` heading, refuses
      `applied`; an archived change proves `applied`; a tree
      `boardState()` throws on refuses with its message; no temporary
      directory is left after a pass or a refusal. Then the fetch, the
      archive, the evidence, exporting nothing from `bun/turn-gate.ts` it
      does not already export
- [x] 1.4 Failing cases in the same file for the `Pointer`, each under
      `no-pointer` and quoting it: empty; `openspec/changes/foo/ (step 2)`;
      `other: openspec/changes/foo/` where the fixture's `package.json` names
      `demo`; `openspec/changes/archive/foo/`; a well-formed slug
      `origin/main` lacks; `openspec/changes/archive/2026-10-27-foo/` while
      `origin/main` holds `foo` active or archived under another date. And
      passing: that archive on `origin/main` proving `done`;
      `demo: openspec/changes/foo/` read as `openspec/changes/foo/`; an
      active pointer at a change since archived proving `done`. Then export `POINTER` from
      `bun/work-take.ts` and `ARCHIVED` from `bun/board-state.ts`, read
      by both callers, and use them; `bun/work-take.test.ts` and the
      `board-state*` tests stay green
- [x] 1.5 Failing cases in `bun/work-status.test.ts` for the rest: from
      `approved` with room, `--to archiving` writes (the order is not
      checked); `exploring` to `explored` writes and runs no `git`; no ask
      settings, a page read answering 500, a query answering 500 and a page
      whose parent is no data source each refuse under `unread`, exit 1 and
      send no `PATCH`; a write sends `{ properties: { Status: { select: {
      name } } } }` alone and prints `status: <card> <from> → <to>` from
      the `PATCH` answer; a `PATCH` answering 500 exits 1 and records
      nothing; no printed line holds the token; each refusal's record carries
      its id and, with `CLAUDE_PROJECT_DIR` unset, the checkout as its
      project (`// spec: gate-ledger/a-status-move-refused`). Then finish
      `bun/work-status.ts`; `wc -l` every file touched, each under 300
- [ ] 1.6 Live probe from the tree, in this group's pull request, with the
      ask integration granted *Update content*; each refusal writes nothing:
      `--to approved`, an `idea` card entering the range under
      `HARNESS_WIP_LIMIT` set to the board's live count, `--to done` on
      a card with an empty `Pointer`, `--to applied` on this card while group
      2 is open, and `--to done` from a branch holding an unpushed commit
      that archives this change. Record each command and its line in the
      pull request body

## 2. The connector's Status write and the prose

- [ ] 2.1 Failing cases in `bun/status-guard.test.ts`, the event on stdin:
      `update_properties` with `Status`, and `update_content` with `Status`
      beside `Assign`, exit 2 naming `bun bun/work.ts status` and write one
      `status-guard` record under `mcp-status`; `Assign` alone, no
      `properties`, an empty one, and `properties` as a string pass; a
      non-JSON event and one with no `tool_input` pass. Then write
      `bun/status-guard.ts`
- [ ] 2.2 Failing cases in `bun/self-pin.test.ts`: the harness's settings
      hold the status guard in a `PreToolUse` group of its own under
      `^mcp__.+__notion-update-page$`, type `command`, no `if`, not async,
      the exact pin-path text with no `# harness-managed` mark; `HOOKS` holds
      no entry for it; a sync of those settings keeps it; a consumer's sync
      writes no `status-guard.ts`; `bun/settings.ts`'s check still passes
      the harness's settings. Then add the registration to
      `.claude/settings.json`
- [ ] 2.3 Prose: `core/feature-workflow.md`'s *Move the card* bullet — in the
      harness a session moves the eight statuses with `bun bun/work.ts status
      --card <id> --to <status>`, which refuses what this change's spec
      lists, and the connector's `Status` write is refused there; elsewhere
      the bullet stays the whole of what holds them until roadmap stage 11.
      The README's `work.ts` paragraph names `status` and the ask
      integration's *Update content*. Grep `core/`, `README.md`,
      `openspec/specs/`, the sub-agent brief and this card for "moved by
      hand", "set Status" and `notion-update-page` sites the change makes
      false, and fix each

## 3. The probe after the pin bump

- [ ] 3.1 Live probe once the pin passes group 2's merge: a
      `notion-update-page` call setting this card's `Status` refused by the
      hook in a harness session, and one setting `Assign` alone passing;
      and the first moves the command wrote since group 1 merged, each line
      as printed and the card read back. Record them in that pull request
      and on the card; once it merges, move the card to `applied` with
      `bun bun/work.ts status`
