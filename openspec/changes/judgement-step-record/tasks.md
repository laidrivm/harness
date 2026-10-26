# judgement-step-record — tasks

The test tasks come from the proposal-stage `/zombies` run and are written
before the code they cover (`core/testing.md`); the numbers in brackets are
that run's idea numbers. Each test points `XDG_STATE_HOME` at a temporary
directory, so no case reads or writes the real ledger, and spawns `git` and
the hook with an environment from which every `GIT_*` variable is removed, so
a run under a hook with an inherited `GIT_DIR` reads the scratch repository
(slice item 0 makes that general; until then each new test does it itself).
`wc -l` every file before adding to it, and split by the 300-line cap first.

Group 1 is one pull request, `feat/judgement-step-record`. Group 2 is ticked
in the self-pin bump pull request that moves the pin past group 1's merge
(design.md, *Migration Plan*).

## 1. The hook, `ran()` by gate and rule, and the registration

- [ ] 1.1 Write `bun/skill-record.test.ts`, spawning `bun/skill-record.ts`
      with an event on stdin, in a scratch repository with one commit and a
      `git worktree add` of it at a second commit, `CLAUDE_PROJECT_DIR` set to
      the main checkout:
      - a `PostToolUse` event for the `Skill` tool, `tool_input.skill`
        `zombies`, `cwd` the worktree, appends one record: gate `skill`,
        decision `called`, rule `zombies`, `commit` the worktree's full
        `HEAD`, `project` the worktree's real top level, `session` the
        event's `session_id` [3, 19, 20];
      - a `UserPromptExpansion` event, `expansion_type` `slash_command`,
        `command_name` `triage`, `cwd` the main checkout, records rule
        `triage` at the main checkout's `HEAD` [4]; the same event with
        `expansion_type` `mcp_prompt` records nothing (local review);
      - after that record, `ran()` finds it asked for the gate `skill` and
        the rule `zombies`, and the runner's default asks find nothing [24];
      - two calls append two records, in order [5];
      - a `cwd` in a subdirectory records the top level as `project` [8];
      - `tool_input.args` and `command_args` holding a path and a token
        appear nowhere in the ledger line, and the record holds exactly the
        six ledger keys and `commit` [16, 17];
      - no record, exit 0 and empty stdout for: empty stdin [1]; stdin that
        is not JSON [21]; an event with neither `tool_input.skill` nor
        `command_name` [2]; a name that is empty [7] or not a string [15]; a
        staged edit [10]; an unstaged edit [11]; a repository with no commit
        [12]; a `cwd` that is no repository [13]; a `cwd` that does not exist
        [14];
      - an untracked file alone still records [9];
      - an unwritable state directory: exit 0, empty stdout [22];
      - stdout is empty and the exit 0 on the recording path too [18].
      Record that they fail. (Req: gate-ledger — *Each skill call is recorded
      for the commit its directory holds*, all its scenarios; *A record holds
      no command text*)
- [ ] 1.2 Write `bun/gate-ledger-ran.test.ts` against `ran()`'s `ledger`
      argument: a `zombies` skill record at the commit is no runner record,
      with or without the rule `diff-budget` asked [25]; a passing
      `diff-budget` runner record is found among `zombies` and `triage` skill
      records at the same commit [27]; a `triage` skill record is not found
      when `zombies` is asked [28a]; a `finish` or `command-guard` block
      naming the commit is found neither as a skill call nor as a runner
      record [28]; with no decision asked, a `fail` runner record is found
      [29]; a `pre-pr` record with no `rule` is no `diff-budget` record when
      that rule is asked [31]. In `bun/turn-gate-record.test.ts`, a `zombies`
      skill record for the tip leaves a turn with gate lines refused [25];
      in `bun/goal-check.test.ts`, a `zombies` skill record for `HEAD`
      without a `diff-budget` one leaves the goal open [26]. Record that they
      fail. (Req: gate-ledger — *A reader counts a record only for its own
      gate and step*, all its scenarios)
- [ ] 1.3 First check whether `work-finish` (#308) or slice item 1 has merged
      `ran()`'s `rule` filter: if so, keep its signature and add only the
      gate, defaulting to `pre-pr`; otherwise change `ran()` in
      `bun/gate-ledger.ts` to `ran(commit, top, {gate = "pre-pr", rule,
      decision} = {}, ledger?)`, matching `gate`, `commit`, `project`, and
      `rule` and `decision` when given. `ranUnder` asks for `diff-budget` and
      `pass`, `bun/goal-check.ts` for the same, and `bun/turn-gate.ts` asks
      for nothing more than today. Update the header comment of
      `gate-ledger.ts` that says `ran` reads only the runner's records, and
      add `"rule":"diff-budget"` to the passing `pre-pr` record
      `bun/ci-run.test.ts` writes. Update design.md D1 in the same commit if
      the merged signature differs from it. Make 1.2 pass; run `bun test
      bun/gate-ledger bun/turn-gate bun/goal-check bun/ci-run bun/pre-pr`.
- [ ] 1.4 Write `bun/skill-record.ts` per design.md D2–D4: read stdin, take
      the name from `tool_input.skill`, or from `command_name` when
      `expansion_type` is `slash_command`, delete
      `CLAUDE_PROJECT_DIR`, read `HEAD`, the top level and
      `git status --porcelain --untracked-files=no` in the event's `cwd`,
      and call `record("skill", "called", name, {session_id, cwd: top},
      head)`; print nothing, exit 0 on every path. Make 1.1 pass.
- [ ] 1.5 In `bun/self-pin.test.ts`, write first and record that they fail:
      the tracked settings register the skill-call hook under `PostToolUse`
      with the matcher `Skill` [32] and under `UserPromptExpansion` in a group
      with no matcher [33], each `{type: "command", command}` with no `if`,
      `async`, `asyncRewake`, `args` or other `shell`, the command running
      `$CLAUDE_PROJECT_DIR/node_modules/harness/bun/skill-record.ts` and not
      ending with `# harness-managed` [34]; `HOOKS` holds no entry for that
      script [35]; `syncSettings` over a temporary copy of the tracked
      settings leaves both registrations as they were [36], and over an empty
      consumer tree writes no `Skill` or `UserPromptExpansion` hook [35].
      Then add the two registrations to `.claude/settings.json`. (Req:
      harness-updates — *A hook the harness keeps to itself reaches no
      consumer*, all its scenarios)
- [ ] 1.6 Docs: `README.md`'s line that `.claude/settings.json` registers the
      hooks `bun/bootstrap.ts` lists gains the one hook kept to the harness
      and why; `core/review-toolkit.md`'s "nothing proves they ran" says that
      in the harness's own sessions a hook records each skill call at the
      commit its directory holds, which proves the call and not that the step
      was followed. Grep `openspec/specs`, `core/` and `README.md` for
      "nothing proves" and "only the pre-PR runner's records" and reconcile
      every site. Verify: `bun test` passes; `openspec validate
      judgement-step-record`.

## 2. Live probe, once the pin moves past group 1

- [ ] 2.1 In the self-pin bump pull request that moves the pin past group 1's
      merge, after `bun install`: start a session in the harness's checkout,
      call `/zombies` through the `Skill` tool and type `/triage`, then read
      the ledger's last two records with `jq` and confirm each names the
      gate `skill`, its skill and the checkout's `HEAD` [37]. Record the
      result, or the field name the platform actually sends, in the pull
      request; a mismatch reopens 1.4.
