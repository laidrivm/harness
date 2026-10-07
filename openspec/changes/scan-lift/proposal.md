# scan-lift

## Why

Two copies of one left-to-right source scanner stand in the tree, and the
second is wrong in a way its own specification already forbids. `PLAN.md` has
carried this as *The rule of two* since `reviewable-diff-gates` deferred it.

The defect reproduces today. `bun/spec-coverage.ts` strips literals per
line, and that strip stops at an escaped quote: `const s = "he said \"/*\"";`
leaves a stray `/*`, the block-comment flag sticks, and every `// spec:`
citation below it in that file is dropped. Measured against a fabricated
repository holding one criterion and one citation — with the escaped quote the
criterion reads as uncited and the check reports no problem at all; the control
without it is cited. The failure is silent where it happens and loud where it
is not: the floor reports uncited criteria rather than a broken scanner.

`bun/scan.ts` is the correct scanner. It already exports `comments`, the
view a caller reading comments needs, and `bun/mutation-floor.ts` already
takes it — both landed in `14fc537`, outside this change, which is why neither
is work here. `spec-coverage.ts` is the caller that has not switched.

## What Changes

- `bun/spec-coverage.ts` drops its per-line strip and derives which lines
  sit inside a block comment from `scan.ts`'s `comments` export. A citation
  below an escaped quote becomes visible.
- `bun/scan.test.ts` gains cases for that export on the shapes `blank`'s
  own cases cannot reach, because they are about what is returned rather than
  about what survives.
- `core/rules.md` gains the rule of two in its Code list.
  `reviewable-diff-gates` prescribed that vehicle — "its own one-line rule,
  separately" — and the nearest rule there today covers only the opposite
  direction.

## Non-goals

- **The mutation floor's half of the scan.** `drop-mutation-exemptions`
  removes the requirement that `exemptions()` serves, so the directive this
  change once proposed to make visible has no reader left. That change owns
  `bun/mutation-floor-exemptions.test.ts` and the grammar with it.
- **The other two rule-of-two candidates.** The tracked-file sweep and the
  focus-restore idiom are their own changes, each with its own card carrying
  its own count; they share the rule this one writes down and nothing
  else.
- **Making `scan.ts` a parser.** It answers one question per character — what
  encloses it — and `comments` answers it for comments rather than for code. A
  caller wanting syntax gets a parser, not this.
- **Widening `scan.ts` beyond `ts` and `css`.** The language table stays what
  its callers need.

## Capabilities

### New Capabilities

None. `bun/scan.ts` is the shared implementation of a check an existing
capability already specifies; giving a helper a capability of its own would put
a specification where `core/rules.md`'s Code rules already govern the
technique.

### Modified Capabilities

- `spec-test-traceability`: the requirement that a test cites a criterion in a
  `// spec:` comment gains a scenario pinning the case it fails today — a
  citation below a string holding an escaped quote and a `/*`.

## Impact

- `bun/spec-coverage.ts` — the per-line strip and its `ponytail:` comment
  deleted, ~25 lines, replaced by a derivation over the comment list.
- `bun/scan.test.ts` — cases for `comments`, which shipped without its own.
- `src/app/module-classes.test.ts` (in d2ass) — `blank`'s only production
  caller; unaffected, and the check that this change leaves `blank` alone.
- `core/rules.md` — one Code rule.
- No dependency changes. The consumer is a gate, so a regression in it shows as
  a gate that passes on nothing.
