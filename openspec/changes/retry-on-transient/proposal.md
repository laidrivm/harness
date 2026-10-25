# retry-on-transient

## Why

A network error, a timeout or a 5xx from GitHub or Notion ends a pass
`refused` or `open`, exits 1, and `pass.sh` writes `<clone>.stop`: every later
tick pauses until the user deletes the file by hand, exactly as for a real
failure. On 2026-10-24 a push from a laptop whose network dropped failed with
`error connecting to api.github.com`; on the host the same blip would have
stopped the loop until someone looked (card *Skip a tick on a transient
failure instead of pausing the clone*). `no-pause-on-question` took the
question case out of the pause; this takes out the transient one.

## What Changes

- The runner classifies a failure as transient where it surfaces: a request
  to GitHub's API or Notion's REST API that never answered, timed out, or
  answered 5xx or 429; the key holder's mint failing for one of those reasons
  or killed at its limit; a `git fetch` or `git push` whose stderr names a
  network failure; a pick or stage session the Claude API ended with no
  answer, a 5xx (529 overloaded included) or a 429, read from the result
  object `claude -p --output-format json` prints. Anything else stays a real
  failure, the subscription's usage limit included, which
  `loop-every-stage` makes an outcome of its own.
- The board loop gains an outcome, `retry`, with exit status 75
  (`EX_TEMPFAIL`): the pass hit a transient failure at the default branch's
  fetch, the App's identity or the integration's id read before the pick, the
  pick session, the stage session when it left no uncommitted edit, the push
  clone's fetch, the mint or the push after the stage session, or the
  question's post. Work a session left stays on its step branch, which the next
  pass continues as it does today.
- `pass.sh` writes no stop file for exit 75 and counts consecutive ones in
  `<clone>.retries`; the third in a row writes the stop file, as a failed pass
  does. Any pass that exits otherwise clears the count. Its own fetches, the
  push clone's and the harness pin's, count as transient too.

## Capabilities

### Modified Capabilities

- `board-loop`: the `retry` outcome and which failures it covers; the App
  scenario where GitHub does not answer.
- `orchestrator`: the stop-file requirement skips a transient pass until it
  repeats three times.

## Impact

- New `bun/transient.ts`: the class, the exit status and the classifiers.
- `bun/github-app.ts`, `bun/github-app-minted.ts`, `bun/github-app-mint.ts`,
  `bun/notion-bot.ts`: throw or exit transient where the failure is one.
- `bun/board-loop-session.ts`: sessions print JSON, and `session()` reads
  their result and whether the API ended them.
- `bun/board-loop.ts` (split first: it sits at 289 of 300 lines),
  `bun/board-loop-push.ts`: the outcome and its four call sites.
- `orchestrator/pass.sh`, `orchestrator/README.md` §7: the count and the
  wrapper's exit 75.
- `after: no-pause-on-question`: both deltas modify requirements that change's
  deltas modify, so it is archived first.
- Tests beside each; `orchestrator/pass*.test.ts` run only where `flock`
  exists (Linux CI).
