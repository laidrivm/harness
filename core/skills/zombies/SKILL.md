---
name: zombies
description: Suggest tests worth writing for a feature using the ZOMBIES heuristic (Zero, One, Many, Boundaries, Interface, Exceptions, Simple scenarios). Pass a free-text feature description, or omit args to use the current branch's diff. Outputs only the categories that apply — not a full ZOMBIES checklist. Use when the user asks what tests to write, and proactively after implementing a feature to surface test gaps.
argument-hint: "[--base <branch>] [feature description]"
allowed-tools: "Bash(git diff:*), Bash(git log:*), Bash(git merge-base:*), Bash(git rev-parse:*), Bash(git symbolic-ref:*), Bash(git status:*), Bash(find:*), Bash(ls:*), Bash(grep:*), Read, Grep, Glob"
---

# ZOMBIES

## Arguments

Raw arguments: $ARGUMENTS

If the arguments start with `--base <branch>`, use `<branch>` as the base branch and treat the rest as the feature description. Otherwise treat all arguments as a **free-text feature description** (e.g. "sign-in code login flow", "image upload validation") and locate the relevant code and tests yourself using `Grep`/`Glob`.

If no base branch was given, detect the default branch with `git symbolic-ref --quiet --short refs/remotes/origin/HEAD`, which prints nothing when it is unset — not `git rev-parse --abbrev-ref origin/HEAD`, which echoes its argument back and resolves to the literal `HEAD`. Use the ref whole (`origin/main`); if it is empty, fall back to `main`. Call the result `<base>`.

If no feature description remains, run `git diff <base>...HEAD` and use the diff as the feature scope.

## Goal

Identify the **most valuable tests to write** for the feature, using ZOMBIES as a thinking tool. The output is a list of test ideas for whoever acts on the report to write — **this skill does not write or stub the tests**.

ZOMBIES stands for:

- **Z**ero — no inputs / empty state
- **O**ne — a single input / the happy path
- **M**any — multiple inputs, ordering, pagination, concurrency
- **B**oundaries — limits, off-by-one, min/max lengths, timing edges, type edges
- **I**nterface — the contract/shape of the public API (return types, status codes, redirects)
- **E**xceptions — invalid input, failures, expired/used/missing state, auth failures
- **S**imple scenarios — the common everyday usage paths a real user takes

**Skip categories that don't apply.** A read-only endpoint may have nothing under "Many". A pure validator may have nothing under "Interface". Only list tests that are genuinely worth writing — quality over coverage.

### Interface prompts

When weighing the **I** letter for an HTTP/JSON endpoint, check the contract against these (skip any that don't apply):

- Is every contract key present even when its value is null (no keys that vanish)?
- Do enums arrive as strings, booleans as true/false, dates as ISO 8601 with offset?
- Is the casing consistent across the whole payload, including error bodies and pagination metadata?
- Does an error response carry a machine-readable `code` (and `action` where the user can act), not just a message string?
- Are status codes right for the failure class (validation → 4xx, never 500)?

**Only when the feature ships UI components** — the UI's contract with assistive technologies is also an interface. Check:

- Is every interactive element reachable and operable by keyboard alone?
- Are state changes (loading, success, error, expiry) announced — `role="status"`, or `role="alert"` for genuinely urgent ones?
- Does the element appear in the accessibility tree with the right role and an accessible name (label / alt)?

If the diff contains no UI, skip this block silently.

### Layer routing

Each suggestion belongs to a test layer:

- **Z / O / M / B / I / E** letters → unit or integration tests by default.
- **S (Simple scenarios)** describing a user-facing journey through the UI → mark the bullet with the suffix `(e2e candidate)`; these belong in the e2e smoke suite. An S bullet that is exercisable through the API alone stays unmarked (integration).

## Instructions

### 1. Locate the feature

- **With args**: search the codebase with `Grep`/`Glob` for files matching the description. Read the implementation files (controllers, models, actions, validators) and the existing test file if one exists.
- **Without a description**: run `git diff --name-status <base>...HEAD` and `git diff <base>...HEAD`, then read the changed implementation files. Skip auto-generated files:
  - Lockfiles: `composer.lock`, `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lockb`, `Cargo.lock`, `go.sum`, `poetry.lock`, `Gemfile.lock`
  - Compiled assets: `public/build/`, `dist/`, `build/`
  - Generated route/type definitions: Wayfinder action/route files, generated TS types, `*.generated.*`

### 2. Generate ZOMBIES suggestions

For each ZOMBIES letter, ask: *is there a test here that would catch a real bug or document real behaviour?* If yes, list it. If no, skip the letter. For the I letter, walk the Interface prompts above; for the S letter, apply Layer routing.

**Cross-reference against the existing test file.** This skill outputs tests *to write*, not a coverage map — so:

- **Skip behaviours already fully covered** by an existing test. A covered behaviour is not a test to write; listing it buries the gaps that matter.
- **Keep a behaviour that's only partially covered** — where a test exercises it but misses an important assertion (e.g. asserts a successful login redirect but never checks the code is consumed). Prefix the bullet with `[partial]` and name the missing assertion.
- When unsure whether a test covers a behaviour, keep the bullet rather than dropping it — a false "already covered" silently hides a real gap. Prefix such bullets with `[verify coverage]` so the user can tell a certain gap from a possible one.

Suggestion quality bar:

- **Specific, not generic.** "Test maximum email length (255 chars)" beats "Test boundaries".
- **Reference real values from the code** when possible — column lengths from migrations, expiry windows from config, validation rules from FormRequests.
- **One test per bullet.** Don't combine "test A and B" into one line.
- **Phrase as a behaviour to verify**, not as a method name. "Expired sign-in code returns 422" beats "test_expired_code".

### 3. Output the report

Group by feature area first (if the diff covers multiple features), then by ZOMBIES letter within each. **Letters always appear in ZOMBIES order — Zero, One, Many, Boundaries, Interface, Exceptions, Simple.** Skipping a letter never reorders the rest: the letters you do show must still run top-to-bottom in that fixed sequence (e.g. show Boundaries before Interface before Exceptions, even if Zero, One, and Many were all skipped). Use this format exactly:

In each feature heading, name the test file the ideas belong in — the existing test file you cross-referenced, or the conventional path for a new one (this names a destination, not implementation hints). `(e2e candidate)` bullets belong in the e2e suite regardless of the heading's file.

```
## 🧟 [Feature Area] (tests/Feature/SignInCodeTest.php)

**Boundaries**
1. Email field rejects values longer than 255 chars (matches migration column)
2. Sign-in code expires exactly at the 15-minute mark

**Interface**
3. Error for an expired code carries code "code_expired", not only a message string
4. `expiresAt` is returned as ISO 8601 with offset

**Exceptions**
5. Expired code returns a validation error
6. Already-used code cannot be redeemed twice
7. Submitting code for an unknown email fails silently (no user enumeration)

**Simple**
8. Requesting a code emails the user and creates a `SignInCode` row
9. User signs in end-to-end: request code → follow email → land authenticated (e2e candidate)
10. [partial] valid code logs the user in — existing test asserts the redirect but never asserts the code is consumed
```

The `🧟` prefix and `##` level are what make a feature heading stand out from the bold `**Letter**` sub-headings — keep both. If multiple features are in scope, repeat the block per feature, separating each with a `---` horizontal rule so the boundaries between features are obvious.

End with a one-line summary: `X test ideas (Y e2e candidates).` — omit the parenthesis when there are none.

Then the gate line, exactly one of:

- `ZOMBIES gate: PASS — no gaps.`
- `ZOMBIES gate: OPEN — N gaps unaddressed.` (N = test ideas listed, including `[partial]` and `[verify coverage]` ones)

This skill only ever finds gaps — it never closes them, so any gap leaves the gate `OPEN`. Whoever acts on the report closes it: after writing the tests, or deciding with a stated reason not to, they re-emit the line as `ZOMBIES gate: PASS — N gaps dispositioned.` — or `ZOMBIES gate: BLOCKED — <what needs the user>.` if a gap can't be settled without them. A missing test harness, a CI job that doesn't run this suite, a fixture the repo never had — **a finding about the environment the tests land in is not a gap in the diff**: close the gate and report the environment fact separately, below the gate line. The last gate line of the turn is the one that counts.

If there's nothing worth testing (e.g. trivial rename, pure config change), output exactly:

```
✅ Nothing worth writing tests for.
ZOMBIES gate: PASS — no gaps.
```

## Rules

- **Don't stub the tests.** This skill outputs ideas only; writing them is the step that acts on the report and closes the gate.
- **Skip ZOMBIES letters that don't apply.** Do not write "(none)" placeholders. Quality over coverage.
- **Gaps only.** Skip behaviours an existing test already fully covers. Keep partially-covered behaviours, prefixed with `[partial]` and naming the missing assertion. When unsure, keep the bullet prefixed with `[verify coverage]` — never silently drop a real gap.
- **Name the target test file** in each feature heading — existing file or conventional path for a new one.
- **Route by layer.** Mark UI-journey Simple scenarios with `(e2e candidate)`; never mark other letters with it.
- **Always preserve ZOMBIES order.** The displayed sections must follow Zero → One → Many → Boundaries → Interface → Exceptions → Simple. Skipping letters is fine; reordering the remaining ones is not.
- **One heading per letter, per feature area.** Each ZOMBIES letter appears at most once within a feature area — collect all of that letter's bullets under its single heading. Never repeat a letter's heading.
- **Be specific.** Reference actual lengths, timings, statuses, route names from the code. Generic suggestions are worthless.
- **One behaviour per bullet.** No "and" joining two tests.
- **Number the ideas sequentially across the whole report**, never restarting per letter or per feature — so "write 3 and 7" picks out exactly two tests. The numbers in the gate line count the same items.
- **No implementation hints.** Don't suggest assertions, factories, or test setup — just what to verify.
- **Group by feature first, then by letter.** Don't dump everything under one giant ZOMBIES list when the diff spans multiple features.
- **No preamble.** Start with the first `## [Feature Area]` heading.
- **No closing advice** beyond the summary line.
- **Always end the report with the gate line** — including the nothing-to-test case. It's the machine-readable result a driving agent, PR template or hook reads without re-parsing the report.
- **The gate line ends the report, not the turn.** When another task invoked this skill, act on the report and continue that task in the same turn; only a standalone `/zombies` run stops at the gate line.
