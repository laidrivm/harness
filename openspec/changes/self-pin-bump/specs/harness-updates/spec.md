## ADDED Requirements

### Requirement: The harness proposes its own pin bump by pull request

After every successful `test` run on the harness's `main`, and when started
by hand, the harness SHALL propose moving its own development-dependency pin
to `main`'s newest commit whose `test` run succeeded, on the target rule a
consumer's bump uses. The proposal SHALL be one commit on one branch, changing
only `package.json`'s pin and `bun.lock`, with no sync, check or `bumpTest`
run, and one open pull request from that branch, opened by an identity whose
pull requests run the harness's `test` workflow. A newer proposal SHALL
replace the branch's commit and update that pull request, never open a
second. The pull request's body SHALL name the old and new commits and how
many commits the pin moves past. The proposal SHALL push nothing to `main`.

It SHALL change nothing when the target is not green, is the commit already
pinned, or differs from the pinned commit only in `package.json` and
`bun.lock`, since that is the tree a merged bump leaves and proposing it would
open one bump per merged bump.

#### Scenario: A green main the pin lags gets a bump pull request

- **WHEN** `main`'s head has a successful `test` run and the pinned commit
  differs from it in a file other than `package.json` and `bun.lock`
- **THEN** the bump branch holds one commit over `main` moving
  `devDependencies.harness` and `bun.lock` to the head, a pull request from it
  is open, its body names both commits and the count between them, and
  `main` has not moved

#### Scenario: A second bump updates the open pull request

- **WHEN** a bump runs while the previous bump's pull request is still open
  and `main`'s green head has moved again
- **THEN** the same pull request now carries one commit moving the pin to the
  new head, and no second bump pull request is open

#### Scenario: A merged bump proposes nothing

- **WHEN** a bump runs on a `main` whose only change since the pinned commit
  is a merged bump's `package.json` and `bun.lock`
- **THEN** it exits 0, pushes nothing and opens nothing

#### Scenario: A manifest change that is no bump is proposed

- **WHEN** `main`'s green head differs from the pinned commit only in
  `package.json`, in a field other than the harness pin
- **THEN** the bump moves the pin to that head, as for any other change

#### Scenario: A head not yet green proposes nothing

- **WHEN** a bump runs while `main`'s head has no successful `test` run, or
  is the pinned commit
- **THEN** it exits 0, pushes nothing and opens nothing

#### Scenario: The bump reads a development-dependency pin

- **WHEN** a manifest names the harness only under `devDependencies`
- **THEN** the pin is read and moved there; a manifest naming the same pin
  under both moves both, and one whose two fields differ reads and moves the
  runtime one
