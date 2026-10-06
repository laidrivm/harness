# bun-version-sites — design

## Context

The bun version is stated in three kinds of site, each read by a different
tool and raised by a different thing:

| site | how it is written | what raises it |
| --- | --- | --- |
| ten `bun-version` inputs across five workflows | a YAML step input | nothing |
| two `oven/bun:<version>-alpine` tags in `Dockerfile` | an image tag beside a digest | Dependabot `docker` |
| `@types/bun` in `package.json` | a manifest dependency | Dependabot `bun` |

`PLAN.md` has carried the mismatch as a count since the figure was eight. The
count drifted twice without anybody noticing, and the levelling that finally
happened was manual and triggered by a red merge rather than by a check.

Every site reads `1.4.2` today, so the check lands green and its failing cases
are fabricated.

## Goals / Non-Goals

**Goals:**

- Every site found by reading the files, so a job added later is covered by
  existing.
- A failure that names the sites and the versions, not a count.
- The two kinds of pin told apart, so the Safety rule about naming what
  updates a pin is answerable per site.

**Non-Goals:**

- Saying which version is right. Agreement is the property; the version is a
  decision.
- Reading the digest. `checks/container-image.test.ts` owns that.
- A general "every pinned tool agrees" check. bun is the only tool that is
  both a runtime a workflow installs and a package the manifest names.

## Decisions

### Each site is read through the parser its own tool uses

`CLAUDE.md`: *read a value a tool consumes from the structure that tool
parses, and where it takes effect — never from a line of the file that
resembles it.* So:

- the workflow inputs come from `Bun.YAML.parse`, walked as
  `jobs.*.steps[*].with["bun-version"]`, which is what `setup-bun` reads. A
  grep for `bun-version:` would also match the string in a comment, in a
  `run:` block, or under a key `setup-bun` never looks at;
- `@types/bun` comes from parsing `package.json` as JSON;
- the image version comes from the tag in the `FROM` line, which is the only
  one of the three with no parser of its own — so it is matched against the
  `oven/bun:` prefix rather than against a version-shaped pattern anywhere in
  the file.

`Bun.YAML` is already how `checks/` reads workflows and `scripts/check-yaml.ts`
validates them, so this adds no way of reading a file that the repository does
not already have.

### The walk is scoped by what it exempts

`CLAUDE.md`: *scope a scan by what it exempts, never by an enumeration of what
it covers — the collections the scan itself walks included.* The check walks
every file under `.github/workflows/`, every job in it and every step of every
job. A step that uses `oven-sh/setup-bun` and states no `bun-version` fails
rather than being skipped: a job taking the runner's default bun is a site
that agrees with nothing, and an enumeration of the jobs that matter would
have been the count this change exists to remove.

*Alternative considered.* Listing the five workflow files. Rejected on the
entry's own evidence — the figure went eight, nine, ten, and each step was a
file or a job somebody had to remember to add.

### The updaters come from `.github/dependabot.yml`, not from a comment

Which ecosystem raises which site is read from the Dependabot configuration
rather than written beside each site. A comment repeated at ten sites is the
count in another form, and it goes stale silently; the configuration is what
actually decides, and `checks/container-image.test.ts` already reads it for
the image's digest. The check therefore asserts that the sites with an updater
have the ecosystem entry that raises them, and that the workflow inputs have
none.

### It lives in `checks/`, not `scripts/`

`checks/` holds assertions about this repository's own artefacts; `scripts/`
holds executable gates with a command of their own. Nothing runs this from a
hook or a workflow step directly — it runs because `bun test` does, which is
already in the pre-push hook and in `test.yml`.

## Risks / Trade-offs

- **The check passes the day it lands and never fires again.** → Its value is
  the day a release moves one site; the fabricated cases are what prove it
  would fire, and they are written first against the implementation rather
  than after it.
- **A future workflow installs bun some other way.** → Then it is a site the
  walk does not recognise, and the check says nothing about it. The walk keys
  on `oven-sh/setup-bun`, which is what every job uses today; a second method
  arriving is a change to this capability, not a silent hole, because the job
  that used it would still have to pass the step-level assertion.
- **Widening the alias clause changes what the policy demands.** → It does
  not: `checks/agent-permissions-prompts.test.ts` already reads the alias of
  every gated command, and `Bash(bun up *)` is already listed. The clause is
  being brought up to the check, which is the direction that costs nothing.
