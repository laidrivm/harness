# notion-create-status-gate — tasks

Group 1 is one pull request, `feat/notion-create-status-gate`; group 2, the
probe after the pin bump, is ticked in the pull request that records it.
Each failing case first, its failure recorded, cited as `// spec:
work-status/<slug>`. The event goes on the guard's stdin as
`bun/status-guard.test.ts`'s `guard()` sends it today.

## 1. The guard on notion-create-pages

- [ ] 1.1 Failing cases in `bun/status-guard.test.ts`, a `create()` event
      builder beside `update()` with `tool_name`
      `mcp__claude_ai_Notion__notion-create-pages` and a `data_source_id`
      parent: one page at `approved` exits 2 naming `pages[0]`, `idea` and
      `bun bun/work.ts status`, with one `status-guard` record under
      `mcp-status`; two pages, `idea` then `exploring`, refuse naming
      `pages[1]` (`// spec: work-status/a-card-created-past-idea`); two pages
      both past `idea` refuse naming `pages[0]`; `"Idea"`, `" idea"`, `""`
      and `{ select: { name: "approved" } }` each refuse; the reason names
      `idea` and not "no Status"; `mcp__notion__notion-create-pages` at
      `approved` refuses (another server name); `pages` sent as the JSON
      string of a one-page array at `approved` refuses, and so does an
      entry whose `properties` is the JSON string `{"Status":"approved"}`.
      Passing with no output and no record (`// spec:
      work-status/a-card-created-at-idea-or-with-no-status`): `idea`, `null`,
      no `Status`, no `properties`, a `page_id` parent with only `title`,
      `mcp__notion__notion-create-pages` at `idea`, an empty `pages`; and
      failing open: `pages` as a string that does not parse or as an
      object, an entry that is `null` or a string, a `properties` that is a
      number, no `tool_input`.
      A create event whose top-level `properties` holds `Status` and whose
      `pages` hold none passes, and so does an event with `pages` at
      `approved` and no `tool_name`, read as an update with no
      `properties`. Today's update cases stay green unchanged, the update
      `Status: null` refusal and the passing string `properties` among
      them. Then add the create branch to
      `bun/status-guard.ts`, keyed on `tool_name` ending in
      `__notion-create-pages`, and its header comment naming both tools;
      verify with `bun test bun/status-guard.test.ts`
- [ ] 1.2 Failing cases in `bun/self-pin.test.ts`: `STATUS_GUARD` pins the
      matcher `^mcp__.+__notion-(update-page|create-pages)$` as a literal,
      no longer `NOTION_MATCHER`, with the rest of the group as today; a new
      case runs that matcher as a `RegExp`: `notion-update-page` and
      `notion-create-pages` under `claude_ai_Notion` and `notion` match;
      `notion-create-comment`, `notion-update-page-x`,
      `notion-create-pages-x`, `notion-duplicate-page` and
      `claude_ai_Notion__notion-create-pages` do not; `NOTION_MATCHER` still
      equals `^mcp__.+__notion-update-page$`. Then change the group's
      matcher in `.claude/settings.json`, and the `STATUS_GUARD` comment and
      its test title, which name the update-page matcher; verify with `bun test
      bun/self-pin.test.ts bun/settings-notion.test.ts` and the settings
      check case in the same file
- [ ] 1.3 Prose: in `core/feature-workflow.md`, *the connector's `Status`
      write is refused there* names creating a card at any `Status` but
      `idea` too; beside *an unattended session takes no work from `idea`*,
      a clause that a card a session files for its own task is created at
      `idea` and moved with `bun bun/work.ts status` in the same turn
      (design, *A session's own card*). Grep `core/`, `README.md`,
      `openspec/specs/` and the active changes for `notion-update-page`,
      "Status write" and "create its card" sites this change makes false —
      `fix-card-done-by-pr`'s risk line naming this card stays true until
      this merges — and fix each; `bun test` green, `wc -l` every touched
      `.ts` file under 300

## 2. The probe after the pin bump

- [ ] 2.1 Once the pin passes group 1's merge, in a harness session: a
      `notion-create-pages` call under the `Harness` data source with one
      page at `Status` `approved` refused by the hook with the reason above
      and a `status-guard` / `block` / `mcp-status` ledger line; the same
      call at `idea` passing, the created card then moved to `discarded` by
      the user or left at `idea` for them; a control call with no `Status`
      key, read back, showing what the board fills in by itself; one call
      with a lower-case `status` key at `idea` (harmless either way), read
      back: `idea` where the control read no status means the connector maps
      the key (design, *Risks*); and one call with `pages` as a JSON string
      at `idea`, read back, showing whether the connector parses it. A
      mapped key, or a parsed string `properties` on update, becomes a card
      on the `Harness` board. Record each on this change's card and in that
      pull request; the probe cards stay as created for the user to discard
