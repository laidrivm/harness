---
name: warm
description: Evaluate every dependency a branch pulls in — client or server, any language — against the WARM check (Worth it, Alive, Right-sized, Maintained securely) plus a supply-chain Safety check (install scripts, typosquatting, release freshness). Diffs the branch against a base, finds newly added or upgraded direct dependencies across all manifests, and scores each one. Use when the user asks to "WARM check" a branch, vet new dependencies, or review what a PR adds to the dependency tree — and proactively after you add or upgrade a dependency yourself.
argument-hint: "[base branch]"
allowed-tools: "Bash(git diff:*), Bash(git log:*), Bash(git merge-base:*), Bash(git rev-parse:*), Bash(git symbolic-ref:*), Bash(git status:*), Bash(git show:*), Bash(bun info:*), Bash(bun audit:*), Bash(composer audit:*), Bash(pip-audit:*), Bash(curl -s https://api.npmjs.org/:*), Bash(cat:*), Bash(find:*), Bash(ls:*), Bash(grep:*), Read, Grep, Glob, WebSearch, WebFetch"
---

# WARM

## Arguments

Raw arguments: $ARGUMENTS

Parse the arguments as the **base branch** to diff against. If empty, detect the default branch with `git symbolic-ref --quiet --short refs/remotes/origin/HEAD`, which prints nothing when it is unset — not `git rev-parse --abbrev-ref origin/HEAD`, which echoes its argument back and resolves to the literal `HEAD`. Use the ref whole (`origin/main`); if it is empty, fall back to `main`.

## Goal

Evaluate the dependencies this branch **pulls in** — added or upgraded since it diverged from the base — against the **WARM** check, and give each one a clear verdict. Cover both **client-side and server-side** dependencies, in **any language**. The output helps the user decide which new dependencies to keep, reconsider, or pin/patch before merge.

WARM stands for:

- **W**orth it? — could ~20 lines of your own code replace it? A dependency you'd write in an afternoon isn't worth the supply-chain surface.
- **A**live? — recent commits, active maintenance, real release cadence. A package last touched years ago is a liability.
- **R**ight-sized? — are you pulling a whole library for one function? Match the dependency's footprint to what you actually use.
- **M**aintained securely? — known vulnerabilities (CVEs/advisories), unpatched issues, or a maintainer with a poor security track record.

Plus a fifth, supply-chain check:

- **S**afety — is this the package it claims to be, and is this release safe to install? Install scripts, identity/typosquatting, release freshness.

**This is about direct dependencies you chose to add.** The four questions are decisions *you* make about *your* dependency — they don't apply to transitive packages dragged in underneath. Evaluate direct additions; only mention transitive packages under **M** when they carry a known advisory.

## As a step in the pre-merge sequence

WARM is a **pre-merge gate**, not just a report. When an agent runs the pre-merge sequence rather than the user invoking `/warm` by hand, this skill is one step in it — the driving sequence decides where it runs — and the step behaves like this:

- **Precondition** — run only if a dependency manifest or lockfile changed between the base and `HEAD` (step 1 answers this; a lockfile-only change gets the audit alone). Neither changed → the step is a no-op that passes; don't ask the user, don't linger.
- **Placement is the sequence's call.** A **Hold** means the branch shouldn't be installed, let alone reviewed or merged — found late, it wastes every pass run before it, so a sequence should place this step ahead of its costly review steps.
- **Exit condition** — the step **passes** when no dependency is left on **Hold** and no ❌ on **M** is unresolved. **Keep** and **Reconsider** verdicts do not block: they are the user's call, recorded and carried forward.
- **Hold blocks the sequence.** Stop there, surface the finding, and wait for the user. Don't run the remaining steps against a branch with a suspected supply-chain problem, and never resolve it by installing or upgrading on your own.
- **Pass continues the sequence** in the same turn. The gate line ends the report, not the turn; only a Hold stops it.
- **Emit the gate line** (below) as the last line of output so the driving agent can read the outcome without re-parsing the report.

## Instructions

### 1. Find what the branch pulls in

Run `git diff --name-status <base>...HEAD` (three-dot — changes on this branch since it diverged) and identify changed **dependency manifests**. These declare direct dependencies and exist in every ecosystem:

- **JS/TS (client & server)**: `package.json`
- **PHP**: `composer.json`
- **Python**: `requirements*.txt`, `pyproject.toml`, `Pipfile`, `setup.py`, `setup.cfg`
- **Ruby**: `Gemfile`, `*.gemspec`
- **Go**: `go.mod`
- **Rust**: `Cargo.toml`
- **Java/Kotlin**: `pom.xml`, `build.gradle`, `build.gradle.kts`
- **.NET**: `*.csproj`, `Directory.Packages.props`, `packages.config`
- **Elixir**: `mix.exs`
- **Dart/Flutter**: `pubspec.yaml`
- **Swift**: `Package.swift`

Don't restrict yourself to this list — if a changed file is clearly a manifest for another ecosystem, treat it as one.

For each changed manifest, run `git diff <base>...HEAD -- <manifest>` and extract the **added** dependency lines (and **version bumps**). Use the lockfile diff (`package-lock.json`, `composer.lock`, `pnpm-lock.yaml`, `go.sum`, `Cargo.lock`, etc.) only to confirm resolved versions and to spot transitive packages with advisories — not as the source of which dependencies to judge.

**Scope:**
- **New direct dependencies** → full WARM + **S**.
- **Minor/patch upgrades of existing direct dependencies** → evaluate **A**, **M**, and **S** (Worth-it and Right-sized were already decided when it was first added); note the version delta.
- **Major upgrades** (e.g. 7.x → 8.x) → evaluate **A**, **M**, **R**, and **S** — majors often change footprint and API surface.
- **Removed dependencies** → ignore.

**S applies to every addition and upgrade** — a compromised maintainer account ships through a version bump just as easily as through a new install.

If **only lockfiles changed** (transitive bumps, an audit autofix) with no manifest touched, skip the full WARM: run the ecosystem's audit tool on the branch state, report any advisories found, and note that only transitive dependencies moved. End with `WARM gate: PASS — only lockfiles changed, no advisories.`, or with the `BLOCKED — <package> has an unresolved advisory.` line naming each advisory's package. Then stop.

If no manifest and no lockfile changed, output exactly:

```
✅ No dependencies added or upgraded on this branch.
WARM gate: PASS — no manifests changed.
```
…and stop.

### 2. Gather the facts for each dependency

Look up what you need to answer each letter honestly. Sources, in order of preference:

- **W (Worth it)**: read how the branch actually *uses* the dependency (`Grep` the import/require/use sites) and judge the surface area you depend on. A date-formatter used in one component is a different proposition than an HTTP client used everywhere.
**JS/TS lookups use `bun`, not `npm`:**

```bash
bun info <pkg>@<version>        # version, license, deps, dist-tags, maintainers
bun info <pkg> time.created     # 2015-09-11T02:41:33.521Z
bun info <pkg> time.modified    # last publish of any version
bun info <pkg> repository.url   # git+https://github.com/preactjs/preact.git
bun info <pkg>@<version> scripts  # {"postinstall": "node install.js"}
bun info <pkg> --json           # everything at once
curl -s https://api.npmjs.org/downloads/point/last-week/<pkg>
```

Three constraints: `bun info` takes **one field per call** — `bun info preact name version` prints only `name`, so either one call per field or `--json` and parse it; it must run **inside a directory with a `package.json`** or it errors out; and bun has **no download counts**, so weekly downloads still come from the npmjs API via `curl` — exactly as written above. `curl` is allowlisted for `https://api.npmjs.org/` only; any other host goes through `WebFetch`. `<version>` is the one the branch's lockfile resolves: without it `bun info` answers for the latest release, which is not what gets installed. `bun info` has no publish date per version, so the resolved version's date is `time["<version>"]` from `WebFetch https://registry.npmjs.org/<pkg>`.

- **A (Alive)**: check the registry/repo for last release date and recent commit activity. Use `bun info <pkg> time.modified` / `WebFetch` the repo page. Note the latest release date and whether the repo is archived.
- **R (Right-sized)**: compare the dependency's footprint (sub-dependencies, install size, breadth of API) against the slice the branch uses. Pulling a 40-dependency framework to call one helper is not right-sized.
- **M (Maintained securely)**: check for known advisories. Prefer ecosystem tooling when available (`bun audit`, `composer audit`, `pip-audit`). If the tool isn't installed, don't install it — go straight to `WebSearch` the package name + "CVE"/"advisory" and check the advisory database, and say which method you used. Report the resolved version and whether a fixed version exists.
- **S (Safety)** — three checks per dependency (JS/TS: `bun info <pkg>@<version> scripts`, `bun info <pkg> repository.url`, the resolved version's registry `time`, plus the downloads `curl`; other ecosystems: `WebFetch` the registry page):
  1. **Install scripts**: does the package declare a script that runs at install — `preinstall`, `install`, `postinstall` or `prepare` (or the ecosystem's equivalent lifecycle hooks)? A script that downloads and executes a binary or opaque bundle → ❌. A build-related script in a package that plausibly needs one (native addons) → ⚠️, name what it runs.
  2. **Identity**: the name is not a typo/suffix neighbour of a popular package (`lodash` vs `Iodash`, `eslint-config-*` squats); the `repository` field points to a live repo that actually publishes this package; age and download counts are plausible for what the package claims to be. Any mismatch → ❌.
  3. **Release freshness**: the resolved version was published fewer than ~7 days ago on a long-established package → ⚠️ (compromised-maintainer pattern); combined with a newly appeared install script → ❌.

**Honesty rule:** if you cannot verify something (no network, registry unreachable, ambiguous package), say what you checked and mark that letter `unknown` — never fabricate a release date, version, or CVE.

### 3. Score and decide

For each dependency, mark each letter:

- ✅ — fine on this dimension
- ⚠️ — a concern worth a second look
- ❌ — a real problem
- `?` — couldn't verify

Then give a one-word **verdict** derived from the marks:

- **Keep** — no ❌, at most minor ⚠️.
- **Reconsider** — ❌ on **W** or **R** (you probably don't need this dependency, or not this much of it).
- **Patch/Pin** — ❌ on **M** only (the dependency is justified but has a security issue — upgrade to the fixed version or pin).
- **Replace** — ❌ on **A** (unmaintained) or multiple ❌s.
- **Hold** — ❌ on **S** (possible supply-chain attack — do not install or merge until verified; overrides every other verdict).

### 4. Output the report

Order dependencies by concern: ❌ verdicts first, then ⚠️, then clean **Keep**s. Use this format exactly:

```
## `dayjs` — added to package.json (client)

- ✅ **Worth it** — date parsing used across 6 components; non-trivial to hand-roll correctly
- ✅ **Alive** — last release 2 months ago, active repo
- ✅ **Right-sized** — 2KB, zero dependencies, tree-shakeable
- ✅ **Maintained securely** — no known advisories for 1.11.x
- ✅ **Safety** — no install scripts; name/repo match; resolved version published 2 months ago

**Verdict: Keep**

## `left-pad` — added to package.json (client)

- ❌ **Worth it** — single use, pads a string; ~5 lines of your own code replaces it
- ⚠️ **Alive** — last release 4 years ago
- ✅ **Right-sized** — tiny, no sub-dependencies
- ✅ **Maintained securely** — no known advisories

**Verdict: Reconsider** — inline it rather than take the supply-chain surface.

## `guzzlehttp/guzzle` — upgraded 7.4.0 → 7.4.5 in composer.json (server)

- ✅ **Alive** — actively maintained
- ❌ **Maintained securely** — 7.4.0 affected by GHSA-xxxx (cookie leak); 7.4.5 fixes it
- ✅ **Safety** — no install scripts; release predates the branch by months

**Verdict: Patch/Pin** — the upgrade resolves the advisory; keep it.

## `eslint-config-prettler` — added to package.json (dev)

- ❌ **Safety** — postinstall downloads and executes a 4MB bundle.js; name is a typo-neighbour of `eslint-config-prettier`; published 3 days ago

**Verdict: Hold** — likely typosquat with a malicious install script. Do not install; verify the intended package name.
```

End with a one-line summary, then the gate line:

```
4 dependencies evaluated — 2 keep, 1 reconsider, 1 hold.
WARM gate: BLOCKED — eslint-config-prettler on Hold.
```

The gate line is exactly one of:

- `WARM gate: PASS — no manifests changed.`
- `WARM gate: PASS — N dependencies vetted.`
- `WARM gate: PASS — only lockfiles changed, no advisories.`
- `WARM gate: BLOCKED — <package> on Hold.` (name every held package)
- `WARM gate: BLOCKED — <package> has an unresolved advisory.` (❌ on **M** with no fixed version taken)

## Rules

- **Always end with the gate line.** It's the step's result, and the only line the driving agent needs — even in the no-manifests-changed case, where it replaces the `✅ No dependencies added` line.
- **BLOCKED stops the sequence, it doesn't fix it.** Don't install, upgrade, pin, or remove anything to clear a gate — report and hand back to the user.
- **A ❌ on S short-circuits.** When Safety fails, the other letters don't matter — report the S finding, verdict **Hold**, and move on; don't pad the entry with W/A/R/M analysis of a package that shouldn't be installed at all.
- **Judge only what the branch pulls in.** Don't audit the whole pre-existing dependency tree — only additions and upgrades since the base branch.
- **Direct dependencies get the full WARM.** Transitive packages appear only under **M**, and only when they carry a known advisory.
- **Cover client and server.** Label each dependency with which side it lives on (and which manifest) so the user can place it.
- **Language-agnostic.** Treat any manifest from any ecosystem the same way. Don't skip a dependency because it's in a language you'd handle differently.
- **Don't fabricate facts.** Release dates, versions, and advisories must come from a real lookup. If you can't verify, mark `?` and say what you checked.
- **One concern per bullet.** Each WARM letter is one line; don't merge two findings.
- **Be specific and quantified.** "last release 4 years ago", "pulls 40 sub-dependencies", "GHSA-xxxx fixed in 7.4.5" — not "looks old" or "might have issues".
- **The verdict follows from the marks.** Don't soften a ❌ into a Keep, or hedge a clean dependency into a Reconsider. State the verdict plainly.
- **No preamble.** Start with the first `## ` dependency heading (or the no-dependencies line).
- **Don't change any files.** This skill evaluates and reports — it doesn't remove dependencies, edit manifests, or run installs.
