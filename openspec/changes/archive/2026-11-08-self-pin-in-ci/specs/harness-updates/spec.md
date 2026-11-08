# harness-updates — self-pin-in-ci

## ADDED Requirements

### Requirement: The harness proposes its own pin bump by pull request

After each successful `test` run from a push to the harness's `main`, and
when started by hand, the harness SHALL propose moving its development pin
to the `main` head it checked out, once green by the rule a consumer's bump
uses:
one commit changing only `package.json`'s pin and `bun.lock`, with no sync,
check or `bumpTest`, on one branch, and one pull request from it whose
author's pull requests run the required checks. It SHALL push nothing to
`main`.

#### Scenario: A green main the pin lags gets a bump pull request

- **WHEN** `main`'s head has a successful `test` run and the pinned commit
  differs from it in a file other than `package.json` and `bun.lock`
- **THEN** the bump branch holds one commit over `main` moving
  `devDependencies.harness` and `bun.lock` to the head, a pull request from it
  is open with the required checks running on it, its body names both
  commits and the count of commits between them, and `main` has not moved

#### Scenario: A second bump updates the open pull request

- **WHEN** a bump that writes a commit runs while the previous bump's pull
  request is still open and `main`'s green head has moved again
- **THEN** the same pull request now carries one commit moving the pin to the
  new head, and no second bump pull request is open

#### Scenario: A bump after a merged bump opens a new pull request

- **WHEN** a bump that writes a commit runs after an earlier bump's pull
  request from the same branch was merged or closed
- **THEN** a new pull request from the branch is open, and the merged or
  closed one is unchanged

### Requirement: The self bump proposes nothing the pin already runs

The harness's own bump SHALL exit 0, push nothing and open nothing when
`main`'s head is not green, is the pinned commit, or differs from the pinned
commit only in `bun.lock` and the harness fields of `package.json` — the tree
a merged bump leaves, which would otherwise open one bump per merged bump.
Any other difference in `package.json` SHALL count as a change the pin
follows.

#### Scenario: A head not yet green proposes nothing

- **WHEN** a bump runs while `main`'s head has no successful `test` run, or
  is the pinned commit
- **THEN** it exits 0, the tree is unchanged, and it pushes nothing and opens
  nothing

#### Scenario: A merged bump proposes nothing

- **WHEN** a bump runs on a `main` whose only change since the pinned commit
  is a merged bump's `package.json` and `bun.lock`, whether that bump moved
  `devDependencies.harness` alone or both harness fields
- **THEN** it exits 0, the tree is unchanged, and it pushes nothing and opens
  nothing

#### Scenario: A manifest change that is no bump is proposed

- **WHEN** `main`'s green head differs from the pinned commit only in
  `package.json`, in a field other than the harness pin
- **THEN** the bump moves the pin to that head, as for any other change

### Requirement: The self bump refuses two different pins

The harness's own bump SHALL exit non-zero, naming both specs, and change
nothing when its manifest's `dependencies.harness` and
`devDependencies.harness` hold different specs, before any of the quiet stops
above, since a merged-bump comparison that drops both fields would otherwise
pass a head that changed only them.

#### Scenario: Two different pins are refused

- **WHEN** the harness's own bump runs on a manifest whose two harness fields
  hold different specs, even where its head is not green, is the pinned
  commit or reads as a merged bump
- **THEN** it exits non-zero naming both specs, the tree is unchanged, and it
  pushes nothing and opens nothing
