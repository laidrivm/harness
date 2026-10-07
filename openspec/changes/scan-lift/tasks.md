# scan-lift — tasks

One group, so this change ships whole on `feat/scan-lift`. It closes one
acceptance criterion: `spec-test-traceability`'s *A citation below an escaped
quote*.

`scan.ts`'s `comments` export and `bun/mutation-floor.ts`'s switch onto it
shipped in `14fc537`, outside this change; they are preconditions here, not
steps.

## 1. One scan, two views

Closes `spec-test-traceability/a-citation-below-an-escaped-quote`.

- [ ] 1.1 Add the failing case first, against `bun/spec-coverage.ts` as it
      stands, and record that it fails. A test file holding `const s = "he said
      \"/*\"";` and a `// spec:` citation below it, asserting the citation is
      found. A case that passes before the switch pins nothing — the control is
      the same source without the escaped quote, which the implementation
      already handles (*A citation below an escaped quote*)
- [ ] 1.2 Cover `comments` in `bun/scan.test.ts` on the shapes the walk
      exists for and `blank`'s cases cannot reach, because they are about what
      is returned rather than what survives: a block comment's opening line
      when its text spans lines, a `//` inside a block comment and a `/*`
      inside a line comment, a comment inside a template interpolation, and a
      CSS file where `//` is not a comment. `blank`'s own cases have gaps that
      matter more once a second gate routes through this module — a regex
      literal containing `/*`, an escaped backtick, an unterminated template,
      CRLF — so close the ones `comments` makes reachable and name the rest
      here (*A citation below an escaped quote*)
- [ ] 1.3 Switch `bun/spec-coverage.ts` to the export: derive which lines
      sit inside a block comment from the comment list — a block opening on
      line *n* whose text spans *k* newlines encloses *n* through *n + k* — and
      delete the per-line strip with the `ponytail:` comment standing over it.
      1.1's case now passes. Keep two cases the derivation must not lose: a
      citation inside a commented-out block still does not count, and one below
      a block that has closed still does (*A citation below an escaped quote*)
- [ ] 1.4 Record the *set* of cited identifiers before and after 1.3, not only
      the count, and set `FLOOR` to whatever the new count reads with the
      reason on its line. The count moves in either direction and neither is a
      defect on its own: a citation the old scanner dropped becomes visible and
      lowers it, and a false one it accepted disappears and raises it —
      `CITATION` matches a line-leading `// spec:` inside a multi-line template
      literal today, measured, because the per-line strip only removes quoted
      spans that open and close on one line. Read the set difference and say
      which citations moved and why; a count compared alone cannot tell the two
      apart (*A citation below an escaped quote*)
- [ ] 1.5 Compare the full set of describe paths across `bun/scan.test.ts`
      and `bun/spec-coverage.test.ts` before and after, per `core/rules.md`.
      The set changes by exactly 1.1's addition and 1.2's, and by nothing else
      — this change deletes no case (*A citation below an escaped quote*)
- [ ] 1.6 Measure every capped file this change touched and record the numbers,
      whether or not any is over. The cap covers `.ts`, `.tsx` and `.css`, so
      `core/rules.md` is not in this list — the always-on budget in its own
      §*Maintenance & growth* is what governs it, and 1.7 is where that is
      checked. Capped: `bun/scan.ts`, `bun/scan.test.ts`,
      `bun/spec-coverage.ts`, `bun/spec-coverage.test.ts`
      (*change-slicing/No source file exceeds its per-file cap*)
- [ ] 1.7 Add the rule of two to `core/rules.md`'s Code list, in its own
      commit per the rule about a rules edit no artefact asks for. Tighten the
      neighbouring rule rather than appending a variant if it already covers
      the direction: the existing one is *Inline a single-caller helper only
      after grepping for the logic it duplicates elsewhere*, which is the
      opposite direction and stays. Check the always-on budget after adding
      it: `core/rules.md` against the line trigger `context-budget` fixes, and
      the Code sublist against the per-sublist trigger `agent-rulebook` fixes
      (*context-budget/The trigger fires on the one file* — this change's own
      criterion is closed elsewhere, and citing it here would be false)
- [ ] 1.8 Confirm `src/app/module-classes.test.ts` (in d2ass) is untouched by
      this change and passes — it is `blank`'s only caller outside the scanner's
      own tests, a test itself rather than production code, and therefore the
      control that the module's other export was not disturbed
      (*A citation below an escaped quote*)
