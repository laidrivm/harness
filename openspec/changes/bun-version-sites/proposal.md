# bun-version-sites

## Why

Thirteen places state which bun this project runs, and nothing reconciles
them. Ten are `bun-version:` inputs across five workflows, two are the
`Dockerfile`'s `oven/bun:<version>-alpine` tags, and one is `@types/bun` in
`package.json`. Dependabot raises two kinds and not the third: its `bun`
ecosystem moves `@types/bun`, its `docker` ecosystem moves the image, and no
ecosystem reads a workflow input's value.

The drift is not hypothetical. `@types/bun` had reached 1.4.0 and the image
1.4.2 while all ten workflow inputs still said 1.3.14, and the three were only
levelled by hand. What made it visible was not a check but a red merge: two
cases in `checks/agent-permissions-prompts.test.ts` read the installed binary,
and across that gap they demanded opposite permission lists — `bun update`
carries the alias `bun up` from 1.4.2 and carries none in 1.3.14.

A count is the wrong instrument for this. `PLAN.md` has carried the entry
since the figure was eight, then nine, then ten, each time re-counted by a
person; what the sites need is something that reads them.

The same incident left a second description behind its check.
`agent-permissions` §*Every manifest-mutating invocation prompts* is normative
in its first sentence — every invocation form that changes the dependency
record — and the enumeration that follows promises `bun`'s documented aliases
for the install family alone. The test demands an alias for every gated
command, which is why `bun up` had to be listed. The policy was never in
breach; the sentence describing it was narrower than the check enforcing it,
and a description a check has outgrown is the next thing somebody reasons
from.

## What Changes

- A check reconciles every site that states a bun version against one
  another, failing when any disagrees, and names the disagreeing sites. It
  reads the sites rather than counting them, so a workflow job added later is
  covered by existing.
- The check tells the two kinds of pin apart. A workflow input is a version
  string nothing raises; the image tag travels with a digest that Dependabot's
  `docker` ecosystem raises. Both must agree on the version, and only the
  first is a pin without an updater — which is what `CLAUDE.md`'s Safety rule
  about naming what updates a pin asks to be answerable per site.
- `agent-permissions` §*Every manifest-mutating invocation prompts* gains the
  alias clause its check already enforces: an alias for every gated command,
  not for the install family alone.

## Non-goals

- **Raising the version.** The check says the sites agree, never which
  version they should agree on. Moving bun stays a decision somebody makes,
  and this change deliberately leaves it a manual one rather than inventing an
  updater no ecosystem offers.
- **Reconciling the digest.** `checks/container-image.test.ts` already owns
  whether the image is pinned by digest and whether the Dependabot entry that
  raises it exists. This check reads the version in the tag beside it, and
  nothing about the digest.
- **Every other pinned tool.** Biome, Playwright, Stryker and TypeScript are
  manifest dependencies that Dependabot's `bun` ecosystem raises, and none of
  them is restated in a workflow input. The problem is specific to bun, which
  is both the runtime a workflow installs and a package the manifest names.
- **The `actions/*` refs.** They are pinned by SHA with a version comment and
  raised by the `github-actions` ecosystem, so they have an updater and are
  not this change's subject.

## Capabilities

### New Capabilities

- `toolchain-pins`: which sites state the version of the runtime this project
  builds and tests with, that they agree, and which of them has something that
  raises it.

### Modified Capabilities

- `agent-permissions`: the requirement that every manifest-mutating
  invocation prompts describes the gated surface, and its alias clause covers
  the install family where the check covers every gated command. The
  description is widened to what is already enforced.

## Impact

- `checks/` — one new check and its cases.
- `openspec/specs/agent-permissions/spec.md` — one requirement modified, a
  clause widened; no scenario's behaviour changes.
- The `bun-version-sites` card on `Harness` — the `PLAN.md` entry *Ten
  workflow pins nothing updates* became it — is what this closes, and reaches
  `done` when it does.
- No workflow, dependency or runtime change: every site already reads 1.4.2,
  so the check passes on the tree it lands in and its failing case is
  fabricated.
