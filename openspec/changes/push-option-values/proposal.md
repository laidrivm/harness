# push-option-values

## Why

The command guard refused `git push -o --force origin feat/x` and
`git push -o --all origin feat/x`, although git reads `--force` and `--all`
there as the value of `-o` and sends it to the server as a string: nothing is
forced and no ref beyond `feat/x` is pushed. The guard tested every word of a
push for the force and ref-wide spellings before it skipped a value-taking
option's value, so a value that looked like a switch was read as one.
CodeRabbit found it on `main` in a review of #77.

## What Changes

- A push's words are split the way git's own parser splits them — switches,
  operands, and the values of value-taking options, which are neither — and
  the force and ref-wide checks read only the switches.
- A short option's value is the rest of its word or, with none left, the next
  word, so `-fo x` still forces and `-of` does not.
- `--recurse-submodules` joins the value-taking options: git 2.47.0's
  `git push -h` lists its value as required, and the next word is consumed as
  that value.

## Non-goals

- Recognising an abbreviated or negated value option (`--push-opt`,
  `--no-push-option`): neither consumes the next word here, so a switch after
  one is still read as a switch — the direction that can only refuse.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `agent-permissions`: *The git prohibitions are enforced by a hook* names
  the value-taking options anew and blocks a force or ref-wide switch wherever
  it sits **as a switch**, not as another option's value.

## Impact

- `bun/git-options.ts` (`pushWords`, `PUSH_VALUE_OPTIONS`) and
  `bun/command-guard.ts`'s `checkPush`, with their tests in
  `bun/command-guard-push-options.test.ts`.
- `git push -of …`, refused before, is allowed: git reads it as `-o` with the
  value `f`.
