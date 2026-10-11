# harness-auto-bump

## Why

A consumer moves to a new harness only when someone bumps its pin by hand,
and a bump is four edits that must agree: the pin in `package.json`,
`bun.lock`, the rules copy `sync.ts` writes into `harness/`, and — when the
harness changed them — the hook texts in `.claude/settings.json`, which a
person copies out of `bun/bootstrap.ts`. Nobody remembers to do it, so both
consumers, `laidrivm/dota2` and `laidrivm/mellon`, sat on `eddf1fd` while 35
harness commits landed in the three days after it. A rule fixed in the
harness reaches a consumer's sessions and its review bot only when that
consumer happens to be bumped.

## What Changes

Three steps, in this order, each leaning on the one before:

1. **`sync.ts` writes the policy too.** Besides `harness/`, it writes every
   value `bun/settings.ts` asserts exactly: the hook registrations
   `bun/bootstrap.ts` exports and the Bash `deny` and `ask` lists, with the
   two `Edit` entries beside them, into the consumer's
   `.claude/settings.json`, and `[install]` into its `bunfig.toml`. It
   replaces the harness's own entries and leaves every other key, entry and
   hook as it found them. A harness change to its policy then stops being a
   manual edit in each consumer, which is the reason a bump could not land on
   its own.
2. **A consumer bumps itself.** A new `bun/bump.ts`, run by each consumer's
   CI once a day and on demand, reads the harness's `main`. When that commit
   passed the harness's `Test` workflow and differs from the pin, it moves
   the pin and the lockfile, runs `sync.ts`, and gates on `check.ts` and the
   consumer's own unit tests. Green, the result is pushed straight to the
   consumer's `main`; red, nothing is pushed and the run fails. The checks
   run in a job that holds no write token, and the push happens in a second
   job that runs none of the consumer's dependencies. The consumer's
   unit-test command is a new `"harness"` key, `bumpTest`.
3. **A session says when its install is stale.** A `SessionStart` hook,
   exported by `bun/bootstrap.ts` and so written by step 1, prints one line
   when the installed harness is not the pinned one — after a `git pull` that
   brought a bump, until `bun install` runs. It changes nothing and never
   blocks. It reaches every consumer through step 2's first bump after it
   merges.

README's *Consuming* section follows: the hooks are written by `sync.ts`
rather than copied, and a consumer adds the bump workflow and `bumpTest`.
That consumer-side work happens in the consumers' repositories; this change
ships what they consume.

## Non-goals

- A pull request per bump. A pull request opened with `GITHUB_TOKEN` starts
  none of the consumer's workflows, so it would carry no checks to merge on,
  and auto-merge is off in both consumers. The bump's own gate is the check.
- Pushing from the harness. That needs a token in the harness's CI with write
  access to every consumer, and a list of consumers kept here — the
  dependency running backwards.
- A cooldown before adopting a harness commit. The harness's author is its
  only committer, so a delay guards against nobody and only slows a fix.
- Rewriting the pin at session start. A session that does it lands the bump
  on whatever branch is checked out, inside a feature's diff and diff budget,
  and starts broken when the new version fails the check. Step 3 only says
  so.
- Writing anything `bun/settings.ts` checks without dictating its value. The
  allow list, the project's own hooks and its non-Bash permission entries
  stay the consumer's. A prohibition the check enforces, such as
  `disableAllHooks` or a `Write(...)` rule, stays a failure for the consumer
  to fix, since no harness change can introduce one.
- Running a consumer's database, Docker or end-to-end suites on a bump. The
  harness is development tooling and reaches none of what they exercise.

## Capabilities

### New Capabilities

- `harness-updates`: how a consumer adopts a new harness commit — what
  writes the files a pin move changes, when a bump is attempted, what must
  pass before it lands, what a failed one leaves behind, and how a session
  learns that its install lags the pin.

### Modified Capabilities

None. `bun/settings.ts` keeps asserting the same values; only who writes
them changes.

## Impact

- `bun/sync.ts` gains the settings and `bunfig.toml` writes.
  `bun/bootstrap.ts` exports its hook registrations as one list, and
  `bun/settings.ts` exports the permission entries and `[install]` it
  asserts, so `sync.ts` writes exactly what the check reads. `bootstrap.ts`
  also gains the `SessionStart` notice.
- New `bun/bump.ts` and its tests; `bun/config.ts` gains `bumpTest`.
- `README.md`: the *Consuming* section.
- In-flight changes that add a hook to `bun/bootstrap.ts`, such as
  `notion-update-guard`, add it to that one list, and then reach consumers
  through `sync.ts` with no manual step.
- Each consumer: one workflow file, one `package.json` key, and pushes to
  `main` from `github-actions[bot]`. Those pushes start no workflow, so
  neither consumer's push-triggered deploy runs on a bump, which is what we
  want, since nothing deployed changes.
- No dependency. The bump reads GitHub's API with the run's own token.
