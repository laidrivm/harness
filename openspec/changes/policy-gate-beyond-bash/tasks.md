# policy-gate-beyond-bash — tasks

Test tasks come from the proposal-stage `/zombies` run and are written before
the code they cover (core/testing.md — TDD for edge cases). Bracketed numbers
are that run's idea numbers; all 13 are placed below, read for the ask form
the user chose, and two cases without a number come from the design. Numbers
[14] to [23] come from the 2026-10-12 `/zombies` run on the revision that has
the sync write the entries, and are placed in 1.2.

Two groups. Group 1 is a harness pull request on
`feat/policy-gate-beyond-bash-1`. Group 2 is no pull request: each consumer's
automatic bump lands group 1's commit, and the group confirms what it landed.
Its boxes are ticked in the archive pull request.

## 1. The entries, the check that pins them, and the prose they replace

- [x] 1.1 Move `policy`, `consumer` and `changed` from `bun/settings.test.ts`
      into `bun/settings.fixture.ts`, as the other gates share theirs: the
      test file holds 294 lines against the 300-line cap, so the new cases
      go in `bun/settings-mcp.test.ts`. Verify the split by the full describe
      path of every test before and after, not by the count. Then write the
      check tests there: settings with no `mcp__` ask entry are named, and
      the message lists the four expected [1]; the four in another order are
      named [3]; a fifth `mcp__` ask entry is named [4]; an entry naming its
      server, `mcp__claude_ai_Gmail__send_message`, is named [6]; a tool name
      one character off, `mcp__*__notion-create-comments`, is named [7]; one
      of the four moved from ask to deny is named as missing from ask [11].
      Each fails before 1.3. Four more pass before 1.3 and pin that it keeps
      them passing: the policy-keeping fixture gains the four entries and
      still reports nothing [2]; an extra Bash ask entry yields the Bash
      message and no `mcp__` one [5]; a project's own `mcp__` deny entry
      beside the four asks reports nothing (design.md, *Deny still overrides
      ask*); an allow entry with a literal server prefix, as both consumers
      carry, reports nothing (design.md, *Measurements*). (Req:
      agent-permissions — Sending as the user through an MCP tool prompts,
      §*An entry is dropped*, §*A project denies one of the tools outright*)
- [x] 1.2 Write the parentheses tests in the same file: an `mcp__` rule with
      parentheses is named as skipped at load when it stands under ask [9],
      under deny [8] and under allow [10]. Each fails before 1.3. (Req:
      agent-permissions — Sending as the user through an MCP tool prompts,
      §*An entry is written with parentheses*)

      Then write the sync cases in `bun/sync-settings.test.ts`. These fail
      before 1.3:
      - an `ask` list with no `mcp__` entry comes out of a sync with the
        four after its other entries [14];
      - the case for a consumer with no settings file expects the four in its
        `ask` [15];
      - interleaved `mcp__` ask entries collapse into the four where the first
        stood. Those entries are a retired name, one written with parentheses
        (`mcp__*__reply(*)`) and a project's own (`mcp__notion__update`)
        [17] [18] [19] [22].

      These pass before 1.3:
      - the case for the project's own settings moves its `mcp__notion__update`
        from `ask` to `deny`, adds an `mcp__` allow entry with a literal server
        prefix, and both still parse equal after a sync [20] [21].

      These are already covered:
      - the existing case where a previous version's lists come out passing
        the check also cites the new scenario [16];
      - the existing case where a second sync changes no byte covers the
        four once a sync writes them [23].

      (Req: harness-updates — Sync writes every value the policy check
      dictates, §*A consumer adopts the MCP ask entries through the sync*;
      Sync leaves the consumer's own settings as it found them, §*The
      project's own settings survive a sync*)
- [x] 1.3 In `bun/settings.ts`, export the four entries as a list beside
      `MANIFEST_WRITES`, compare the consumer's `mcp__` ask entries whole
      against it, and name any `mcp__` rule carrying `(` in deny, ask or
      allow, with the reason in the message. In the same commit, have
      `bun/sync-settings.ts` write that list into `ask` as it writes the
      `Bash(` subset: in place of the first `mcp__` ask entry, or after the
      other entries when there is none. Leave `mcp__` entries in `deny` and
      `allow` alone. The check and the sync change in one commit because the
      existing sync case [16] reads the check after a sync and is red
      between them. In the same commit, have `README.md`'s line on what
      `sync.ts` writes into `.claude/settings.json` name the `mcp__` ask
      entries beside the `Bash(` ones. `bun test` green; both files under
      their file-size cap.
- [x] 1.4 Add the four entries to the harness's own `.claude/settings.json`
      under `permissions.ask`, and a test in `bun/settings-mcp.test.ts`
      reading that file, whose `mcp__` ask entries equal the exported list
      [12] — the harness's own file is not a consumer and no other test reads
      its permission lists. `bun test` green.
- [x] 1.5 Rewrite `core/git-and-prs.md`'s bullet *Never reply, comment or
      review under the user's name anywhere the `gh` deny entries do not
      reach* as a rule of approval: send under the user's name only through a
      call the user approved at the prompt, and never through a channel no
      entry reaches — a browser form, a direct HTTP call — keeping that
      opening a requested pull request is not that, and that the `gh` writes
      stay refused. `gh-api-guard` narrows the same bullet's GitHub clause:
      whichever lands second narrows from the wording the first left. Grep
      `core/`, `README.md` and `openspec/specs/` for every other site stating
      that sending under the user's name is never allowed or that only the
      `gh` writes are gated, and fix each. (Req: agent-rulebook — A
      mechanised prohibition leaves its prose home)
- [ ] 1.6 This task needs the user and no agent closes it alone. The user
      starts a fresh session in a checkout of the branch after 1.4 is on it,
      since a settings change is observable only in a session started after
      it. In that session, call the mail connector's `send_message` addressed
      to the user's own address, and have the user answer No at the prompt.
      Confirm the prompt appeared and that `create_draft` is still listed,
      and record the result in the pull request [13].

      The pull request is not mergeable before this box is ticked: once
      group 1 is on `main` and green, each consumer's automatic bump adopts
      the entries unattended. If no prompt appears, the wildcard server
      segment does not match: stop and settle the literal form (design.md,
      *Risks*) before the pull request merges. (Req: agent-permissions —
      Sending as the user through an MCP tool prompts, §*The agent tries to
      send mail*, §*A draft still works*)

## 2. Each consumer, through its automatic bump

- [ ] 2.1 dota2: once group 1 is merged and green, confirm on the
      consumer's `main` that the automatic bump landed a pin at or past
      group 1's merge commit, and that the landed `.claude/settings.json`
      holds the four `mcp__` ask entries the sync wrote, with its `mcp__`
      allow entries unchanged. Then run `harness:check` on that commit and
      confirm it is green. If no bump landed, read the `harness-bump`
      workflow's runs, or note that its schedule is disabled, and report any
      failure this change did not cause. Then bump by hand on a branch of the
      consumer's own checkout, never in a worktree, with the same sync.
- [ ] 2.2 mellon: the same confirmation on its `main`. `harness:check`
      green.
