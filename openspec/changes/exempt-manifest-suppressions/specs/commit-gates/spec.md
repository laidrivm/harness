# commit-gates — delta spec

## MODIFIED Requirements

### Requirement: Linter and type-checker suppressions fail CI

CI SHALL fail when a tracked **source** file contains `biome-ignore`,
`@ts-expect-error` or `@ts-ignore`. The scanned set SHALL be every tracked
file that is not prose, rather than an enumeration of source extensions: a
linter acts on more of them than one list remembers, and a source type left off
such a list is exempt with nobody deciding it. Prose is exempt because
documentation and OpenSpec artefacts discuss suppressions by name, this
specification among them, and a check that fails on its own proposal is a check
nobody keeps. The check's own script and test SHALL be
outside the scanned set too, for the same reason and no other: they must carry
the three markers literally to do their job. The repository's root
`package.json` SHALL be outside the scanned set as well, because the allowlist
lives in it and each approval's key names its marker, so scanning it counts
every approval as a suppression of its own. A marker there cannot suppress
anything: the gates read that file as strict JSON, which has no comments, so a
marker can only sit inside a string. A `package.json` below the root holds no
allowlist and SHALL stay scanned. An approved suppression SHALL be
admitted only by naming its exact path, **which marker**, and how many
occurrences of it are approved there, in the check's own allowlist — so the
approval arrives as a reviewable line in the diff rather than as a silent
comment in a source file, a second suppression cannot ride in on the first
one's approval, and swapping an approved `@ts-ignore` for a `biome-ignore` at
the same path is a new approval rather than a free one. An entry SHALL NOT name
the line the suppression sits on: an approval follows the count and not the
occurrence, so deleting an approved suppression and adding another of the same
marker at the same path passes — an accepted ceiling, because the substitution
is two lines of the diff a reviewer reads, while a line number moves with every
unrelated edit above it and would have the allowlist re-approved by someone who
never re-read the reason. The check SHALL read tracked files only, so an
ignored or untracked file cannot fail a clone that does not have it.

#### Scenario: A suppression is added

- **WHEN** a commit adds `// biome-ignore lint/suspicious/noExplicitAny: …`
  to `src/model.ts`
- **THEN** the CI check fails and names the file and line

#### Scenario: An approved suppression

- **WHEN** the same commit also adds `src/model.ts`, `biome-ignore`, count one
  to the check's allowlist
- **THEN** the CI check passes, and the approval is visible in the diff

#### Scenario: An approved suppression swapped for another kind

- **WHEN** that `biome-ignore` is later replaced by an `@ts-ignore` at the same
  path, leaving the allowlist untouched
- **THEN** the CI check fails, because the entry approves one marker and not
  the line it sits on

#### Scenario: The repository as it stands

- **WHEN** the check runs over the current tree
- **THEN** it passes with an empty allowlist, because no tracked source
  carries a suppression today

#### Scenario: A document that discusses suppressions

- **WHEN** a markdown file names `biome-ignore` while explaining this rule
- **THEN** the check passes, because prose is the one thing exempt

#### Scenario: A source type the specification never enumerated

- **WHEN** a tracked `.mjs` file carries a suppression
- **THEN** the check fails, because the exemption is prose and not a list of
  the source extensions somebody thought of

#### Scenario: An allowlisted file gains a second suppression

- **WHEN** a file already on the allowlist gains an unrelated second
  suppression
- **THEN** the check fails — the allowlist admits the approved occurrence, and
  the count is part of what it pins

#### Scenario: A suppression inside a dependency

- **WHEN** `node_modules` or `dist` contains a suppression
- **THEN** the check passes, because it reads tracked files only

#### Scenario: The allowlist names the markers it approves

- **WHEN** the tracked root `package.json` approves `src/model.ts`,
  `biome-ignore`, count one, `src/model.ts` carries that one suppression, and
  the allowlist has no entry for `package.json`
- **THEN** the check passes, because the key naming `biome-ignore` is an
  approval and not a suppression

#### Scenario: A workspace manifest carries a marker

- **WHEN** a tracked `packages/web/package.json` contains `@ts-ignore`
- **THEN** the check fails and names that file, because only the root
  manifest holds the allowlist
