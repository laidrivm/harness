# scan-lift — design

## Context

Two scanners of the same shape stand in the tree, and each answers a different
question about the same walk:

| caller | wants | how it gets it today |
| --- | --- | --- |
| `src/app/module-classes.test.ts` | code with non-code erased | `blank(source, language)` in `scripts/scan.ts` |
| `scripts/mutation-floor.ts` | every comment, its line, block or not | `comments(source, language)` in `scripts/scan.ts` |
| `scripts/spec-coverage.ts` | which lines sit inside a block comment | per-line regex strip, 22 lines |

`scan.ts` is the one that carries the state a correct scan needs — an escaped
quote, a `/*` inside a line comment, a quote inside a regex literal, a template
literal that is text and code at once, and a language table so CSS is not read
as if it had `//` or regex literals. The third row predates it, and its hole is
one of the shapes `scan.ts` was written against.

The blocker that kept that row where it is has gone: `blank` erases what the
caller exists to read, and `comments` — added in `14fc537` — returns it. What
is left is the switch, and a view `spec-coverage.ts` needs that `comments` does
not hand it directly.

## Goals / Non-Goals

**Goals:**

- One walk in one module, with each caller taking the view it needs from it.
- The live defect closed, with a case that fails before the switch.
- `blank`'s contract unchanged, so `src/app/module-classes.test.ts` is
  untouched and stands as the check that this change kept it.
- `comments` covered by its own cases rather than only through a caller.

**Non-Goals:**

- A parser. The only question asked of a character stays *what encloses it*.
- Any new language in the `SYNTAX` table.
- Changing how a citation is *interpreted* once found. `CITATION` and the
  following-comment-lines walk in `spec-coverage.ts` are this change's fixed
  points.

## Decisions

### `spec-coverage.ts` derives its view at the call site

`comments(source, language)` returns `{ text, line, block }[]`. What
`spec-coverage.ts` wants is different: for each line index, is it inside a
block comment. That is derivable from the comment list — a block comment
opening on line *n* whose text spans *k* newlines encloses lines *n* through
*n + k* — so it derives it at its own call site rather than earning a second
export.

*Alternatives considered.* A `regions()` primitive returning every non-code
span with its kind, with `blank` and `comments` as derivations, is the more
general shape and was rejected: nothing asks for string or template spans, and
a third caller wanting them can widen it then. Exporting `enclosed(source)`
alongside `comments()` was rejected on the same ground — one caller, and the
derivation is three lines.

### `comments` earns its own cases, late

It shipped exercised only through `exemptions()`, which reads it for one
purpose. Once `spec-coverage.ts` reads it for another, a defect in it reaches
two gates, and a gate is the worst place to discover a scanner is wrong. The
cases belong to `scripts/scan.test.ts` beside `blank`'s, because the walk is
one and the cases are about which view reports it.

### The rule of two is a `CLAUDE.md` Code rule, not a spec

`reviewable-diff-gates` deferred it as "its own one-line rule, separately". A
rule about when to extract a helper is a statement about how code is written
here, which is what the Code list is; it ages with the code, and no gate can
check it from a diff without reading intent.

## Risks / Trade-offs

- **The switch changes what a gate reports, and a gate that starts failing
  looks like the change broke it.** → The switch lands with the failing case
  first: add the case against the old implementation, watch it fail, then
  switch. The citation count moves in the task list with the input that moved
  it.
- **`spec-coverage.ts`'s derivation of enclosed lines is new code, and the
  citation floor is what would report it wrong.** → The floor is the wrong
  alarm for a broken scanner — that is the defect being fixed, not a mitigation
  — so the derivation gets its own cases: a citation inside a commented-out
  block still does not count, and one below a block that closed still does.
- **`blank`'s behaviour drifts while `spec-coverage.ts` is switched onto the
  module.** → `src/app/module-classes.test.ts` is the control: it is `blank`'s
  only production caller and this change does not edit it. `scripts/
  scan.test.ts` is not a control — this change adds cases to it for `comments`
  — so its existing `blank` cases are regression coverage that must keep
  passing unedited, which is a weaker guarantee and named as one.
- **`drop-mutation-exemptions` and this change both touched `scan.ts`'s
  callers, and the first one to land decides what the second still has to
  do.** → They no longer overlap: that change owns `exemptions()`, its test and
  the `mutation-floor` requirement; this one owns `spec-coverage.ts` and the
  rule. `comments` survives that change because this one names the consumer its
  design looked for and did not find.
