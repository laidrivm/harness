# toolchain-pins — delta spec

## ADDED Requirements

### Requirement: Every site stating the bun version agrees with the others

A check SHALL read every tracked site that states which bun this project runs
and SHALL fail when any two disagree, naming each site and the version it
carries. The sites SHALL be found by reading the files rather than by counting
them against a figure written down: a `bun-version` input under any job of any
workflow in `.github/workflows/`, the version in an `oven/bun:<version>-…` tag
in `Dockerfile`, and `@types/bun` in `package.json`. A workflow job added
later is therefore covered by existing, which a count is not — the figure in
`PLAN.md` read eight, then nine, then ten, each re-counted by hand.

Every site SHALL state an exact version. `oven-sh/setup-bun` also accepts
`latest`, `canary` and a semver range, and offers a `bun-version-file` input
that reads `package.json`, `.bun-version` or `.tool-versions`; with no version
at all it resolves `packageManager` or `engines.bun` from `package.json` before
falling back to `latest`. Each of those is a selector resolved when the job
runs, so the version a reader can obtain from the tree is not the version the
job used — and a site whose version cannot be read cannot be shown to agree
with another. The check SHALL fail on one, naming the site and the selector.

The check SHALL NOT state which version is correct. What it owns is agreement;
which bun to run is a decision, and the check exists so that the decision
reaches every site rather than most of them.

#### Scenario: A workflow input left behind

- **WHEN** one `bun-version` input reads `1.3.14` and every other site reads
  `1.4.2`
- **THEN** the check fails, naming that workflow, that job and both versions

#### Scenario: The manifest raised on its own

- **WHEN** Dependabot raises `@types/bun` and no workflow input moves
- **THEN** the check fails, because the manifest and the inputs disagree

#### Scenario: The image raised on its own

- **WHEN** Dependabot's `docker` ecosystem raises the `oven/bun` tag past the
  version the workflows carry
- **THEN** the check fails, naming the `Dockerfile` and a workflow

#### Scenario: A job added without a version

- **WHEN** a workflow gains a job that installs bun and states no
  `bun-version`
- **THEN** the check fails, because the action resolves the version when the
  job runs — from `package.json` or, failing that, to `latest` — and the tree
  states nothing to compare

#### Scenario: A selector that is not an exact version

- **WHEN** a `bun-version` reads `latest`, `canary` or a range such as
  `1.4.x`, or the job states `bun-version-file` instead
- **THEN** the check fails, naming the site and the selector, because what it
  resolves to is decided at run time and not in the tree

#### Scenario: Every site agreeing

- **WHEN** all thirteen sites read the same version
- **THEN** the check passes, and says nothing about whether that version is
  current

### Requirement: A pin with no updater is named as one

The check SHALL distinguish a site something raises from a site nothing does,
and SHALL fail when a site of the second kind is not recorded as such. A
`bun-version` input is raised by no Dependabot ecosystem: `github-actions`
updates `uses:` refs, `bun` updates the manifest, and neither reads an input's
value. The `oven/bun` tag travels with a digest the `docker` ecosystem raises,
and `@types/bun` is a manifest dependency the `bun` ecosystem raises.

This is what `CLAUDE.md`'s Safety rule — write beside a pin which tool updates
it, or that nothing does — asks to be answerable per site rather than once for
the family, and a comment repeated at ten sites is a count in another form.

#### Scenario: The workflow inputs are the pins with no updater

- **WHEN** the check reports which sites have an updater
- **THEN** the `bun-version` inputs are named as having none, and the image
  tag and the manifest entry are named with the ecosystem that raises each

#### Scenario: An ecosystem entry removed

- **WHEN** the `bun` ecosystem entry leaves `.github/dependabot.yml`
- **THEN** the check fails, because a site recorded as having an updater no
  longer has one
