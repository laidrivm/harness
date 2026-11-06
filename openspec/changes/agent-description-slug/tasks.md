# agent-description-slug — tasks

## 1. The sentence and its test

- [ ] 1.1 Add "`description` with the slug" and "the agent's ID" to the
      phrases `bun/delegation.test.ts` expects in the `### Rules` preamble.
      Run `bun test bun/delegation.test.ts` and record that it fails (no
      sentence)
- [ ] 1.2 Append the sentence of design decision 1, in the wording the user
      confirmed, to the delegation line of `core/rules.md`'s `### Rules`
      preamble. Run `bun test bun/delegation.test.ts` green, then every test
      file that reads `core/rules.md`
