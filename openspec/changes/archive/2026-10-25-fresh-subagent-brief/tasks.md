# fresh-subagent-brief — tasks

## 1. The line and its test

- [x] 1.1 Write `bun/delegation.test.ts` with one case citing
      `delegation/the-rulebook-states-the-rule-where-every-session-reads-it`;
      it reads `core/rules.md` inside the case, takes the `### Rules`
      preamble (up to the first `####`), normalises whitespace, and expects
      "a fresh one", "forking only when", "never into git" and "nothing the
      harness already loads". Run it and record that it fails (no line)
- [x] 1.2 Add the line of design decision 4 to `core/rules.md`'s `### Rules`
      preamble, after the `autonomy.md` line. Run
      `bun test bun/delegation.test.ts` green, then every test file that
      reads `core/rules.md`
