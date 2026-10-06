# repo-layout Specification

## Purpose

Which directory a file of each kind belongs to, the check that refuses one
placed outside it, and the README section that states the contract for a
reader. It exists because thirty-three of the repository's sixty-one root
files were one thing — the nightly snapshot job — and nothing in the tree said
so: they arrived over twelve pull requests because no directory existed to
receive them, and the next three queue entries would have added as many again.

## Requirements

### Requirement: The repository root holds only what is exempted by name

Every tracked file at the repository root SHALL be named in the check's
exemption list, and a tracked root file named nowhere in it SHALL fail the
check, reporting the file and that the list does not name it.

The scan is scoped by what it exempts rather than by the extensions it
covers. A file type nobody has exempted is a file type nobody has placed, and
a scan enumerating the extensions it covers passes silently on the one it was
never told about — which is how thirty-three files reached the root in the
first place. `scripts/file-size.ts` enumerates what it covers and argues the
departure in its own header; this check does not, because a line cap and a
placement decision fail differently: an uncapped file type is merely
unmeasured, where an unplaced one is already in the wrong directory.

The exemption list SHALL carry, for each entry, why that file is at the root
rather than under a directory. A root file added later — a container manifest,
a compose file — is admitted by adding its name and its reason, which is the
decision being made rather than defaulted. An entry whose reason is empty, and
an entry naming a file the repository no longer tracks, SHALL each fail the
check: the first records no decision and the second records one about nothing.

A check that could not read the tree SHALL fail rather than report a clean
root. A scan that matched no root file at all, and a `git` invocation that
exited non-zero, are each a failure to measure, and a failure to measure
satisfies every assertion made over its result. "No root file at all" counts
the regular files that survive the skipping below, so a `git` invocation that
succeeded and listed nothing but symlinks and absent entries is a failure to
measure as well: skipping an entry means not reporting it as misplaced, never
counting it as one the check read. A failing `git` invocation SHALL be
reported with `git`'s own stderr: the check knows only that the command
failed, where the command knows why.

#### Scenario: A source file added to the root

- **WHEN** a tracked `.ts` file that the exemption list does not name is
  present at the repository root
- **THEN** the check SHALL fail, naming that file and reporting that the
  exemption list does not name it

#### Scenario: A file type the list has never seen

- **IF** a tracked root file carries an extension no exemption names
- **THEN** the check SHALL fail rather than pass — the scan admits by name,
  never by extension, so an unfamiliar type is refused instead of ignored

#### Scenario: The repository as it stands

- **WHEN** the check runs over this repository after the moves
- **THEN** it SHALL report no file, every remaining root file being named in
  the exemption list

#### Scenario: A file under a directory

- **WHEN** a `.ts` file is added under `src/job/`, `src/server/`, `scripts/`
  or `checks/`
- **THEN** the check SHALL report nothing — it scopes the repository root and
  no directory below it

#### Scenario: An exemption carrying no reason

- **IF** an exemption entry's reason is empty
- **THEN** the check SHALL fail, the reason being the decision the list
  exists to record

#### Scenario: An exemption naming a file that is gone

- **IF** an exemption names a path the repository no longer tracks
- **THEN** the check SHALL fail rather than carry the entry, which otherwise
  outlives the file it was written for and is read by nobody

#### Scenario: A root entry that is not a regular file

- **WHEN** a tracked root entry is a symlink, or is tracked but absent from
  the work tree
- **THEN** the check SHALL skip it rather than fail on reading it — `git`
  lists both, and neither is a file placed in the wrong directory

#### Scenario: A tree the check could not read

- **IF** the scan matched no root file at all, or `git` exited non-zero
- **THEN** the check SHALL fail, reporting that it could not measure —
  never report a clean root, which is what an unmeasured tree would
  otherwise be indistinguishable from
- **AND** where `git` was what failed, the failure SHALL carry `git`'s own
  stderr

### Requirement: A check reads the tracked tree from the repository root

Every check that lists the tracked tree SHALL resolve the repository root
first and take its listing there, never at the directory the check itself
lives in. `git ls-files` run in a subdirectory lists only what is under that
subdirectory and names it relative to it, so a check taking its listing at
its own location sees a fraction of the repository and resolves the rest to
nothing.

This holds however the check is placed today: a listing that is correct only
while its file sits at the root is correct by accident, and the accident ends
at the next move.

#### Scenario: A check run from a subdirectory

- **WHEN** a check that lists the tracked tree runs from a directory below
  the repository root
- **THEN** its listing SHALL be the whole repository, with paths named
  relative to the root

#### Scenario: The ownership map's paths from outside the root

- **WHEN** the check that resolves the knowledge ownership map's paths runs
  from `checks/`
- **THEN** every path the map names SHALL still resolve, the listing being
  the repository's rather than that directory's

### Requirement: The README states where each kind of file lives

The README SHALL carry a section naming each directory that holds source and
what kind of file belongs in it, together with why the tree is cut that way.
A reader placing a new file learns the answer there rather than by reading
the check or by finding a neighbour that looks similar.

Every directory the section names SHALL be one the repository tracks a file
under, on the same terms `repo-onboarding` fixes for the ownership map: a
section naming a directory that does not exist describes an intention, and a
reader cannot tell one from a description.

A directory named as reserved for work not yet done SHALL be marked as such
and SHALL NOT be required to exist, git tracking no empty directory.

The section's checked rows are directories. A file the section names — an
entry point a later change adds — is prose beside the table and is checked by
nothing, because a row asserting a tracked file under a path cannot express
"this one path is itself the file".

#### Scenario: A directory the section names

- **WHEN** the layout section names a directory without marking it reserved
- **THEN** the repository SHALL track at least one file under it

#### Scenario: A directory reserved for later work

- **WHEN** the layout section names a directory and marks it reserved
- **THEN** the check SHALL NOT require the repository to track a file under
  it

#### Scenario: The section is absent

- **IF** the README carries no layout section
- **THEN** the check SHALL fail rather than pass over an absent heading,
  which is the vacuous pass a section-scoped scan gives when its heading is
  renamed

#### Scenario: The section names no directory

- **IF** the layout section is present and parses to zero directories
- **THEN** the check SHALL fail — a reshaped section satisfies every
  assertion made over its rows by having none, which is the same vacuous pass
  as an absent heading arriving by a different route
