# work-take — tasks

One group, one pull request, `feat/work-take`. Each failing case first, its
failure recorded, cited as `// spec: work-take/<scenario slug>`. The cases
run `bun bun/work.ts take` as a session does, a process with a config home
of the case's own, against a Notion stub of the case's own reached through
`HARNESS_NOTION_API_URL` that records each call's method, path and
`Notion-Version`, as `notion()` in `bun/notion-ask.test.ts` does, and an
`openspec` stub on `PATH`. Split the cases over `bun/work-take.test.ts` and
`bun/work-take-fail.test.ts` before either passes 300 lines.

## 1. `work.ts take`

- [ ] 1.1 Read Notion's API reference for the page markdown read and confirm
      its path `GET /v1/pages/{id}/markdown`, its version `2026-03-11` and
      the fields `markdown`, `truncated` and `unknown_block_ids`. Where it
      differs, correct
      `design.md`'s *Context* and *The order, and what each part reads* and
      the spec's scenarios in the same commit as the stub that follows it
- [ ] 1.2 If `work-finish`'s task 2.1 has merged, drop this task naming its
      pull request. Otherwise its failing cases in `bun/notion-ask.test.ts`
      for the lifted export — the ask command and its new caller read the
      same settings and client, no settings answer a reason, a mode the
      settings refuse answers that reason — then lift the settings read and
      the client out of `ask()`, every existing case green
- [ ] 1.3 Failing cases for the arguments: no arguments, no `--card`, `--card`
      with no value, a 31-hex id, a positional and `--write` each print the
      usage and exit 2 with no call the stub saw and no `openspec` run; a
      32-hex id and a dashed UUID pass
      (`no-card`, `a-malformed-card-id`, `an-option-it-does-not-know`)
- [ ] 1.4 Failing cases for the card: the first line names the checkout's
      `HEAD`; `Name`, `Status`, `Pointer`, `Labels` and `Assign` print from a
      page whose properties are title, status, rich text, multi-select and
      people; a card with `Status`, `Labels` and `Assign` empty prints all
      five names, those three with no value; the stub's markdown prints byte
      for byte, a fenced block and a table included; an empty body prints its
      heading and no `undefined`; `truncated` true adds its line and false
      adds none; two ids in `unknown_block_ids` with `truncated` false add
      a line naming two blocks, and an empty list adds none;
      the markdown call carries `Notion-Version: 2026-03-11` and every other
      call `2025-09-03` (`a-card`, `a-truncated-body`,
      `blocks-notion-could-not-render`)
- [ ] 1.5 Failing cases for the comments: three comments returned out of
      order print oldest first, each with its time; the settings' user prints
      as `user`, a bot's id as its hex; an unanswered last question ends on
      `question waiting: yes`, one the user answered on `question waiting:
      no`, a card with no comments on `no`; two pages joined by
      `next_cursor` print all their comments (`a-question-with-no-answer`,
      `an-answered-question`, `comments-over-more-than-one-page`)
- [ ] 1.6 Failing cases for the pointer, in a temporary git checkout:
      `openspec/changes/demo/` with all four kinds of file prints each under
      its path and names `task-board`; a change with no `design.md` prints
      the rest; the slug missing from the checkout prints its one line and
      the run goes on to `openspec list`; `mellon:
      openspec/changes/demo/`, `openspec/changes/demo/ step 2`,
      `openspec/changes/../x/`, `openspec/changes/Demo/`,
      `openspec/changes/archive/` and `openspec/changes/demo` read no file and
      print their one line; an empty pointer prints that the card points at
      no change (`a-change-in-the-checkout`, `a-change-the-checkout-lacks`,
      `a-pointer-to-another-repository`, `no-pointer`)
- [ ] 1.7 Failing cases for the open changes and the writes: the `openspec`
      stub's output ends the run unchanged (`open-changes`); after a full
      run every call the stub saw is a `GET`, `git status --porcelain` is
      empty and the config home holds no ledger (`only-reads`)
- [ ] 1.8 Failing cases in `bun/work-take-fail.test.ts`, each exit 1 naming
      its step, with the stub's token absent from stdout and stderr: no ask
      settings, with no call made (`no-ask-settings`); 403 on the page read,
      with no change file printed (`a-page-the-integration-cannot-read`);
      500 on the markdown read; a markdown answer whose `markdown` is
      missing or not a string, with no `undefined` printed; a comments read that fails on its second
      page; a working directory outside git; an `openspec` that exits 1, and
      none on `PATH`
- [ ] 1.9 Export `discussion()` and `waits()` from `bun/notion-bot.ts` and
      give `client()` the version as its last parameter, defaulting to
      today's; write `take()` in `bun/work-take.ts` and the `take`
      subcommand in `bun/work.ts` — the dispatcher itself, strict
      `util.parseArgs`, if `work-finish` has not written it — until 1.3–1.8
      pass. Verify with the two new files, `bun/notion-bot*.test.ts` and
      `bun/notion-ask.test.ts`; `wc -l` keeps every touched `.ts` file at or
      under 300
- [ ] 1.10 If `.claude/settings.json` lacks `Bash(bun bun/work.ts *)`: a
      failing case in `bun/self-pin.test.ts` that the harness's own settings
      allow it, then add the entry. Verify with `bun/self-pin.test.ts` and
      `bun/settings.test.ts`
- [ ] 1.11 Prose: the README's ask paragraph and `bun/notion-ask.ts`'s
      header say the ask integration reads pages and comments and writes no
      property, the command itself still reading no page; the README names
      `bun bun/work.ts take --card <id>` beside the ask command, and
      `core/feature-workflow.md`'s bullet on reading a card's comments before
      resuming work names it as the way to read them. Grep `README.md`,
      `core/`, `openspec/specs/` and `bun/` for "comment capabilities" and
      fix each site the grant made false
- [ ] 1.12 Live probe from the tree, before the pull request goes ready:
      `bun bun/work.ts take --card 40439875c31b810d8562f984ab8bc84a`, and
      record in the pull request's body that the page and markdown reads
      answered through the ask integration and `client()`, the body printed
      as the card shows it, and the comments and the `question waiting:`
      line matched the card. A read the probe shows failing is fixed in this
      group, its case first
