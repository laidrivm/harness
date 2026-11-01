## ADDED Requirements

### Requirement: The suppression allowlist is read whole before it admits anything

Each entry of `harness.suppressions` SHALL hold a `count` that is a whole
number, zero or above, and a `why` holding at least one non-whitespace
character, and the suppression scan SHALL fail before admitting any
suppression when an entry does not, naming the entry's key and the field. A
`count` of `"2"` compares as never equal, and one that is not a number at all
compares as `NaN`, which no number of occurrences exceeds — so the entry would
approve every suppression of its marker in that file. An approval with no
reason is a line of the diff a reviewer cannot weigh.

#### Scenario: An allowlist entry the check cannot read

- **WHEN** `harness.suppressions` holds `"src/model.ts biome-ignore"` with a
  `count` of `"two"`, `-1` or `1.5`, or a `why` that is absent or whitespace,
  and `src/model.ts` carries two occurrences of that marker
- **THEN** the check fails naming
  `harness.suppressions["src/model.ts biome-ignore"]` and the field, rather
  than admitting either occurrence
