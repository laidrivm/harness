# tracked-file-sweep — delta spec

## ADDED Requirements

### Requirement: Every check reads the tree through one tracked-file sweep

A check that reads the repository's files SHALL obtain them from a single
shared sweep rather than deriving its own listing, and SHALL apply its own
filter to that sweep's result. No tracked source file other than
`scripts/tracked.ts` and `scripts/tracked.test.ts` SHALL invoke
`git rev-parse --show-toplevel` or `git ls-files` to enumerate the tree — the
sweep's own test is exempt because fabricating a repository is what it does.
Asking git about a named path is not enumerating the tree and is not covered:
`git ls-files --error-unmatch <path>` and a pathspec-scoped listing both answer
a question about paths the caller already holds.

The sweep SHALL take the listing at the repository root and SHALL return paths
relative to it, because `git ls-files` run in a subdirectory reports only what
is under it and names it relative to it — a check run from `scripts/` would
otherwise scope itself to `scripts/` and say nothing about doing so.

The sweep SHALL read tracked files only. An untracked file — whether or not it
matches an ignore rule — is one a clone does not have, so it cannot be allowed
to fail a clone or to satisfy a check that a clone would fail. A tracked file
matching an ignore rule is not that case: the ignore rule does not apply to it,
a clone receives it, and the sweep returns it.

The sweep SHALL offer two views over that one listing: the paths as git
reports them, and those among them the filesystem reports as regular files. A
caller that opens what it reads SHALL take the second — a tracked path may be
deleted from the work tree, a symlink, or a submodule gitlink that reads as a
directory, and none of the three is a file to open. A caller that rules on
paths without opening them SHALL take the first, so needing the unfiltered
listing is never a reason to derive a second one.

The sweep SHALL strip only the newline `git rev-parse` terminates its output
with, never trailing whitespace generally: a repository whose path ends in a
space is unusual and not a check's to corrupt.

#### Scenario: A check run from a subdirectory

- **WHEN** a check using the sweep runs with its working directory set to a
  subdirectory of the repository
- **THEN** it reads every tracked file in the repository, named relative to the
  repository root

#### Scenario: A tracked file absent from the work tree

- **WHEN** a tracked path is deleted from the work tree, or is a symlink or a
  submodule gitlink
- **THEN** the regular-file view omits it and no check attempts to open it,
  while the unfiltered view still reports it for a caller that rules on paths

#### Scenario: A repository path ending in a space

- **WHEN** the repository's root path ends in a space
- **THEN** the sweep resolves the root with that space intact, and the paths it
  joins against it resolve

#### Scenario: A second listing is introduced

- **WHEN** a tracked source file other than `scripts/tracked.ts` and
  `scripts/tracked.test.ts` invokes `git ls-files` or
  `git rev-parse --show-toplevel` to enumerate the tree
- **THEN** a check in the suite fails, naming that file — the filter belongs at
  the call site and the listing does not
