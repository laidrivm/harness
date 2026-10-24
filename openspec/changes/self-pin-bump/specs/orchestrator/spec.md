## ADDED Requirements

### Requirement: A host pass names how far its harness pin lags main

A pass on the host SHALL write, as the first line of its log and before the
runner starts, the harness commit it runs and how many commits that commit is
behind the harness's `main`, whenever it is behind. A pin at `main`'s head
SHALL add no line. Reading the harness's `main` SHALL never refuse, pause or
delay the pass beyond the read itself: a read that fails SHALL add no line,
and the pass SHALL run as it would without it.

#### Scenario: A pass runs a lagging pin

- **WHEN** a host pass's pin names a commit 3 commits behind the harness's
  `main`
- **THEN** the pass log's first line names the pin's short commit and 3, and
  the pass runs that pin

#### Scenario: A pass runs main's head

- **WHEN** the pin is the harness's `main` head
- **THEN** the pass log holds no lag line

#### Scenario: The harness's main cannot be read

- **WHEN** the fetch of the harness's `main` fails
- **THEN** the pass log holds no lag line, no stop file is written for it,
  and the pass runs the pin
