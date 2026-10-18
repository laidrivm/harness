# unattended-line-trim — tasks

One group, shipped whole on `fix/unattended-line-trim`, which carries this
change and its apply together. The numbers in brackets are this change's
`/zombies` ideas, marked `[tn]` in the test file. The tests are written
before the code they cover (`core/testing.md`).

## 1. Read the declared line with the whitespace around it ignored

- [x] 1.1 In `bun/question-gate-unattended.test.ts`, under *which session is
      unattended*, write the cases:
      - the line indented by two spaces reads unattended [t1] —
        `// spec: agent-autonomy/a-declared-line-copied-from-a-terminal`;
      - the line ending in `\r`, in a CRLF prompt, reads unattended [t2];
      - the line with a trailing space reads unattended [t3], replacing
        `question-gate-reason`'s attended case [9];
      - the line led by a tab reads unattended [t4];
      - the stage prompt with every line after the first indented by two
        spaces reads unattended [t9];
      - the indented line with text after the sentence reads attended [t6];
      - the indented line without its full stop reads attended [t7].
      Verify: `bun test bun/question-gate-unattended.test.ts` fails exactly
      [t1], [t2], [t3], [t4] and [t9]; the rest pass.
      (Req: agent-autonomy — A session is attended unless the prompt that
      started it says otherwise; agent-permissions — A question to the user on
      a board card needs no prompt)
- [ ] 1.2 In `bun/question-gate.ts`, have `unattended()` compare each line of
      the first prompt with the declared line after `trim()` (design.md D1),
      and say so in its comment and `UNATTENDED`'s.
      Verify: `bun test bun/question-gate-unattended.test.ts` passes whole.
- [ ] 1.3 Say in `core/autonomy.md` that the line is read ignoring the
      whitespace around it, and in `core/feature-workflow.md` that a
      terminal copy of the launch form still declares it.
      Verify: `bun test` passes, `bun/autonomy.test.ts`'s check that the doc
      holds the line unindented included.

Not written: [t5], a whitespace-only line before the declared one, and [t8],
the indented line only in the second prompt. Neither changes with the trim:
a blank line trims to nothing, and which prompt is read comes before any
line is compared.
