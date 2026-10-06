## Why

The mutation floor carries an escape hatch nobody has opened. `src/model.ts`
holds no `// Stryker disable` directive and never has, yet 320 lines across
three files exist to validate the spelling of one — and the failure they
guard against is already caught by the floor itself, one step later and by
construction.

That failure is a malformed directive: Stryker ignores it in silence, so the
author believes a mutant is admitted while it still counts. But a directive is
written in order to lower the floor, and the floor is an exact-match
comparison in both directions. Measured against `gauge` directly:

- malformed directive, floor lowered to 65 → `66 surviving mutants against a
  floor of 65 — kill one, or raise the floor with the reason on its line`
- well-formed directive, floor lowered to 65 → passes
- directive written with the floor left alone → passes, and nothing was
  claimed: the mutant still counts, which is the honest state

So the validator sharpens the message of a guard that already holds rather
than adding one. The hatch keeps its rule — an equivalent mutant is still
admitted by a Stryker directive, because that is Stryker's own feature — it
stops being a thing this repository re-checks.

## What Changes

- Remove `exemptions()` from `scripts/mutation-floor.ts`, with the `DISABLE`
  and `ADMITTED` patterns it reads and its call from the command-line entry
  point. The floor, the survivor count, the report loader and the reason the
  floor's line must carry are all untouched.
- Delete `scripts/mutation-floor-exemptions.test.ts` whole, and the three
  cases in `scripts/mutation-floor-cli.test.ts` that rest on the exemption
  half: the malformed directive, the same comment in another file, and the
  absent model — the second would pass vacuously once nothing reads
  directives, and the third asserts a read the check stops making. `MODEL` and
  `MODEL_NAME` lose their last readers and go with them; a renamed
  `src/model.ts` still fails loudly, through `stryker run` having nothing to
  mutate and through `survivors()` refusing a report with no mutants.
- Leave `scripts/scan.ts` whole. `comments()` loses this consumer and keeps
  another: `scan-lift` switches `scripts/spec-coverage.ts` onto it, to close a
  defect in that file's own scanner that reproduces today. This change removes
  the import, not the export.
- **BREAKING for authors, not for callers**: a `// Stryker disable` directive
  written from here on is honoured by Stryker and checked by nothing. A
  mistyped one is caught when the floor is lowered to record its gain, not at
  the line it sits on.
- Stryker, `stryker.config.json`, `.github/workflows/mutation.yml` and
  `FLOOR = 66` all stay. Mutation testing is the right instrument for a
  300-line module of pure arithmetic, where line coverage is nearly free to
  reach and proves almost nothing; `bun test --coverage` enforces no threshold
  in this repository and so is not a substitute for anything.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `mutation-floor`: the requirement *An equivalent mutant is admitted at the
  line it occupies* is removed, with its four scenarios. What Stryker does
  with a directive is Stryker's; what this repository checks is the count and
  its floor. Removing the requirement rather than leaving its scenarios
  uncited is what leaves `scripts/spec-coverage.ts`'s `FLOOR` where it
  stands — that file fixes the figure, and this change moves neither it nor
  the gauge.

## Impact

- `scripts/mutation-floor.ts` — loses the exemption half, keeps the floor half.
- `scripts/mutation-floor-exemptions.test.ts` — deleted.
- `scripts/mutation-floor-cli.test.ts` — loses three cases.
- `scripts/mutation-floor.fixture.ts` — its `modules` map exists so the
  command-line cases can stand a copy of the check beside a tree of their own;
  with `./scan.ts` no longer imported it holds the check and `./root.ts`.
- `scripts/scan.ts`, `scripts/scan.test.ts` — unchanged. `comments()` stays
  for the consumer `scan-lift` names.
- `openspec/specs/mutation-floor/spec.md` — one requirement removed.
- `docs/testing.md` §The mutation floor — the four bullets describing the
  directive's accepted form go with it.
- No dependency, workflow or runtime change. Nothing the application ships is
  touched.
