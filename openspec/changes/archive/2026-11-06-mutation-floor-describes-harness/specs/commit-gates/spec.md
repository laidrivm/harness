## ADDED Requirements

### Requirement: An allowlist entry the check cannot read approves nothing

Each entry of `harness.suppressions` SHALL hold a `count` that is a whole
number, zero or above, and a `why` holding at least one non-whitespace
character. An entry that does not SHALL approve no suppression, and the check
SHALL fail naming the entry's key and the field, beside every other problem
it reports rather than in place of them. A `count` of `"2"` approves two only
because the comparison coerces it, and one that is not a number at all
compares as `NaN`, which no number of occurrences exceeds — so the entry would
approve every suppression of its marker in that file. An approval with no
reason is a line of the diff a reviewer cannot weigh. A `harness.suppressions`
that is some other value than an object of entries SHALL fail the check as
such, beside the other problems; one that is omitted or `null` fails as every
missing `harness` key does, before any gate reports, since the manifest's
reader treats the two alike as missing.

#### Scenario: An allowlist entry the check cannot read

- **WHEN** `harness.suppressions` holds `"src/model.ts biome-ignore"` with a
  `count` of `"two"`, `-1` or `1.5`, or a `why` that is absent or whitespace,
  and `src/model.ts` carries two occurrences of that marker
- **THEN** the check fails naming
  `harness.suppressions["src/model.ts biome-ignore"]` and the field, and
  reports both occurrences as unapproved
