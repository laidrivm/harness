# agent-autonomy-flags — tasks

The test comes from the proposal-stage `/zombies` run, and it is written before
the frontmatter it covers (`core/testing.md`). The numbers in brackets are that
run's idea numbers. All five are placed in 1.1.

There is one group, shipped as one harness pull request on `feat/agent-autonomy-flags`.

## 1. Flags, guard and prose

- [ ] 1.1 Write `bun/skill-flags.test.ts`, citing
      `agent-permissions/a-review-skill-the-agent-runs-itself`. It holds one
      case per skill in `coderabbit`, `first-five`, `pr-brief` and
      `review-order` [2], each of which:
      - reads `core/skills/<name>/SKILL.md` and lets a missing file throw [5];
      - expects a leading `---` frontmatter block to be found [1];
      - parses the block with `Bun.YAML.parse` and lets a parse error throw [4];
      - expects `disable-model-invocation` to be absent or exactly `false` [3].
      Each case derives its subject inside the case (`core/rules.md`).
      Verify: `bun test bun/skill-flags.test.ts` fails on all four cases,
      since every one of the four skills still carries the flag.
- [ ] 1.2 Delete the `disable-model-invocation: true` line from the four
      skills' frontmatter (design.md D1).
      Verify: `bun test bun/skill-flags.test.ts` passes. Put the line back in
      `coderabbit` alone and watch that case alone fail, then remove it again.
- [ ] 1.3 In `core/skills/first-five/SKILL.md`, drop `Bash(find:*)` from
      `allowed-tools`, and make the two lines that say to "use `find` or `ls`"
      say Glob or `ls` (design.md D5).
      Verify: `grep -n "find" core/skills/first-five/SKILL.md` names no
      command to run.
- [ ] 1.4 In `core/skills/coderabbit/SKILL.md`, implement design.md D2 and D3:
      - in step 1, read the reviews first, and with none from a
        `coderabbitai` login, end on the new gate line;
      - add the line `CODERABBIT gate: OPEN — no CodeRabbit review on PR #N yet.`
        to step 6;
      - add a rule: fetch once per run, and never sleep, poll, `--watch` or
        fetch again to wait for the bot;
      - add a `(unattended: card — …)` marker to step 5's "Wait for approval"
        and to the project override's dismissal sentence.
      Verify: `bun test bun/autonomy.test.ts` passes, and reading the skill
      top to bottom meets *No review has landed* and *A landed review with a
      dismissal*.
- [ ] 1.5 Mark `core/skills/ship/SKILL.md` step 6 (merge)
      `(unattended: user — leave the merge to the user and report BLOCKED
      naming the pull request)`.
      Verify: `bun test bun/autonomy.test.ts` passes.
- [ ] 1.6 Under `core/autonomy.md`'s `user`, add the paragraph design.md D4
      sets out, naming no skill. In `core/review-toolkit.md`'s `/coderabbit`
      bullet:
      - replace the flag's reason with "run it once the bot's review has
        landed, never to wait for one";
      - replace "Invoking it is the approval … present by definition" with
        D3's reason, and mark the dismissal `card`;
      - make the closing "whenever the user chooses to run it" say the same.
      Verify: `grep -n "present by definition\|reserves it for the user\|whenever the user chooses" core/`
      prints nothing.
- [ ] 1.7 Grep `disable-model-invocation`, `user-only` and `reserved for the
      user` across `core/`, `README.md`, `openspec/specs/` and the active
      changes for a site this step makes false, and correct it.
      Verify: each remaining hit describes a skill that keeps the flag, or the
      flag in general.
- [ ] 1.8 Run `bun bun/pre-pr.ts`, which reports the step's diff within the
      budget. The pull request body names *Who may invoke a skill is enforced,
      not narrated*, *A skill only the user may start is a `user` step* and
      *The bot's review is worked once it has landed, never waited for* as the
      requirements it closes.
