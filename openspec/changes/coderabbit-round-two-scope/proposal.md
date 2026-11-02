# coderabbit-round-two-scope

## Why

CodeRabbit spends review rounds on wording in OpenSpec change artefacts that
go to the archive. Over seven pull requests (#329, #342, #346, #347, #386,
#390, #392) there were about 26 rounds. Four of them, from the second round
on, raised only Minors, and all four were prose under `openspec/`: two in a
change's artefacts, two in synced specs. Most of the other rounds were driven
by Majors on wording in a change's `design.md` and `tasks.md`: #329 had ten
Majors in five rounds, and #347 had a Major in `tasks.md` three rounds
running. The Minor rule below defers the two change-artefact rounds at most;
the Majors are what `path_instructions` is for. Each round costs CodeRabbit
quota (two reviews an hour), a fresh
review request and threads to close. A rule to defer Minors from the second
round on is so far kept only in agents' briefs. The `coderabbit` skill
contradicts it: «Severity budgets attention, not belief» and «`below
severity threshold` is not a reason on its own» forbid a skip by label.

## What Changes

- From a pull request's second round on, `/coderabbit` applies Major and
  above, and the Minors in the living docs. The living docs are
  `openspec/specs/**` and `core/**` (the user's answer 1 b on the card), and
  `CLAUDE.md`, which every session loads (the user's decision of
  2026-11-02). Every other Minor (anything under `openspec/changes/**`,
  delta specs included, code, anything else) is deferred to one tail card for the pull request
  and is not applied. A Minor's round is that of the commit named by the
  review that posted it, and the three-round cap still decides whether a run
  applies anything. The first round keeps fixing every verified finding.
  The rule goes in `core/review-toolkit.md`'s `/coderabbit` bullet, beside
  the three-round cap.
- `core/skills/coderabbit/SKILL.md` step 5 gains one sentence, outside the
  override paragraph's condition: a project's policy may defer a finding to
  a card by its severity, path and round. The finding is listed under
  Skipped as `deferred to <card>` and counts in the arithmetic. Step 3 and
  the rules above are worded so that a deferral the project's policy makes is
  a reason, not a label.
- `.coderabbit.yaml` gains `reviews.path_instructions` for
  `openspec/changes/**`. The text says such a file is a working artefact
  headed for the archive, asks for contradictions with a spec, the code or
  another artefact, and tells the bot not to flag wording, duplication or
  style (answer 2 b), delta specs included.
  `path_filters` stays unset: filtering the path out would have lost the
  Majors on #342, #346 and #347 and left a proposal pull request unreviewed.
- Tests pin the round-two rule's wording in the toolkit, the skill's
  deferral sentence, and the `path_instructions` entry read from the config
  the bot parses.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `agent-autonomy`: adds *From the second round, CodeRabbit's Minors outside
  living docs go to a tail card* beside *A pull request gets CodeRabbit's
  fixes for at most three rounds*, and *The coderabbit skill honours a
  project's deferral*. It modifies the cap's scenario *The third round still
  gets its fixes*, so that a deferred Minor is not applied there.
- `local-review-loop`: adds *The review bot reads a change's artefacts for
  contradictions* to the config contract beside the approval and pause
  requirements.

## Impact

- Changed: `core/review-toolkit.md` (the `/coderabbit` bullet),
  `core/skills/coderabbit/SKILL.md` (step 5, step 3's opening paragraph and Minor line, and the
  rule «Severity budgets attention, not belief»), `.coderabbit.yaml` and its
  header, `bun/review-config.test.ts`, `bun/review-docs.test.ts`, and the
  `local-review-loop` spec's Purpose, which lists what the config pins.
- No code path changes. Nothing mechanises the rule: neither `finish` nor
  `resolve` knows which finding a commit fixes, so a push gate would also
  refuse legitimate Major fixes (design, *No gate*).
- Cost: a deferred Minor's thread stays open, since `resolve` never names a
  thread holding a skipped finding, so the bot's approval waits until the
  user resolves it by hand.
- How it is judged: the rounds of the next pull requests are compared with
  the seven-pull-request round table on the card. A `path_instructions`
  entry is a hint to the bot's model, not a switch, so only that measurement
  shows whether it works. Removing the entry rolls it back.
