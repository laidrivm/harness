# fresh-subagent-brief — tasks

## 1. The doc, the pointer and the check

- [ ] 1.1 Write `bun/delegation.test.ts` with three cases citing
      `delegation/the-rulebook-states-the-rule-where-every-session-reads-it`,
      `delegation/the-doc-copies-no-rule-of-the-rulebook` and
      `delegation/the-doc-holds-none-of-a-session-s-facts`; each case reads
      its files inside the case. Run it and record that it fails (no doc,
      no pointer)
- [ ] 1.2 Write `core/delegation.md` as design *What the doc holds* lists,
      opening with a level-1 heading and holding no session fact. Run
      `bun test bun/delegation.test.ts bun/autonomy.test.ts`
- [ ] 1.3 Add the pointer line of design *The rule reaches every session
      through one pointer line* to `core/rules.md`'s `### Rules` preamble,
      after the `autonomy.md` line, and the doc to `CLAUDE.md`'s list. Run
      `bun test bun/delegation.test.ts` green, then every test file that
      reads `core/rules.md`

## 2. The stage prompt line — **User decision.**

Carried only if the user answers that the stage prompt says it too; deleted
from this file otherwise. Lands after `loop-reads-feedback` merges.

- [ ] 2.1 Add a sixth line to `prompt()` in `bun/board-loop-prompt.ts`,
      naming `core/delegation.md` and the rule, with the fork ban if the
      user chose it; the same line in `core/feature-workflow.md`'s launch
      form and its prose count; the length in
      `bun/board-loop-question.test.ts` to six. Run
      `bun test bun/board-loop-question.test.ts bun/board-loop-stage.test.ts`
