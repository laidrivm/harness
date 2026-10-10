# policy-gate-beyond-bash — tasks

Test tasks come from the proposal-stage `/zombies` run and are written before
the code they cover (core/testing.md — TDD for edge cases). Bracketed numbers
are that run's idea numbers; all 13 are placed below, read for the ask form
the user chose, and two cases without a number come from the design.

Two groups. Group 1 is a harness pull request on
`feat/policy-gate-beyond-bash-1`. Group 2 is one pull request in each
consumer, after group 1 is merged and its commit can be pinned.

## 1. The entries, the check that pins them, and the prose they replace

- [ ] 1.1 Move `policy`, `consumer` and `changed` from `bun/settings.test.ts`
      into `bun/settings.fixture.ts`, as the other gates share theirs: the
      test file holds 285 lines against the 300-line cap, so the new cases
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
- [ ] 1.2 Write the parentheses tests in the same file: an `mcp__` rule with
      parentheses is named as skipped at load when it stands under ask [9],
      under deny [8] and under allow [10]. Each fails before 1.3. (Req:
      agent-permissions — Sending as the user through an MCP tool prompts,
      §*An entry is written with parentheses*)
- [ ] 1.3 In `bun/settings.ts`, export the four entries as a list beside
      `MANIFEST_WRITES`, compare the consumer's `mcp__` ask entries whole
      against it, and name any `mcp__` rule carrying `(` in deny, ask or
      allow, with the reason in the message. `bun test` green;
      `bun/settings.ts` under its file-size cap.
- [ ] 1.4 Add the four entries to the harness's own `.claude/settings.json`
      under `permissions.ask`, and a test in `bun/settings-mcp.test.ts`
      reading that file, whose `mcp__` ask entries equal the exported list
      [12] — the harness's own file is not a consumer and no other test reads
      its permission lists. `bun test` green.
- [ ] 1.5 Rewrite `core/git-and-prs.md`'s bullet *Never reply, comment or
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
- [ ] 1.6 In a session started after 1.4 is on the branch, call the mail
      connector's `send_message` addressed to the user's own address, and
      have the user answer No at the prompt; confirm the prompt appeared,
      that `create_draft` is still listed, and record the result in the pull
      request [13]. A settings change is observable only in a session started
      after it. If no prompt appears, the wildcard server segment does not
      match: stop and settle the literal form (design.md, *Risks*) before the
      pull request merges. (Req: agent-permissions — Sending as the user
      through an MCP tool prompts, §*The agent tries to send mail*, §*A draft
      still works*)

## 2. Each consumer

- [ ] 2.1 dota2, on a branch of its own checkout and never in a worktree:
      bump the pin to group 1's merge commit, run `bun install` and confirm
      the lockfile names `harness` once, run `harness:check` and report any
      failure this change did not cause, then add the four ask entries and
      refresh the rules copy with `sync.ts` in the same commit.
      `harness:check` green.
- [ ] 2.2 mellon: the same steps on its `main`. `harness:check` green.
