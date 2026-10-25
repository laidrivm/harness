## Context

`end()` in `bun/board-loop.ts` exits 0 for `met`, `idle` and `waiting` and 1
for everything else; `pass.sh` writes `<clone>.stop` on any non-zero status,
and every later tick exits 3 until the user removes it. Where a transient
failure surfaces today:

- `bun/board-loop.ts:126-136`: `git fetch -q origin` fails → `refuse()`.
- `bun/board-loop.ts:214-221`: `identity(app)` (`request()` in
  `bun/github-app.ts:68-80`, or `minted()` in `bun/github-app-minted.ts`) and
  `own(bot.token)` (`client()` in `bun/notion-bot.ts:115-133`) throw →
  `refuse()`.
- `bun/board-loop-push.ts`: `carry()`'s fetch of `origin` (78-83), the mint
  (121-129) and `pushRef()` (138-142) return a reason → `open()`.
- `post()` in `bun/notion-bot.ts:207-255` catches a failed read or comment and
  returns `question: not posted — <why>` → `open()`.
- `orchestrator/pass.sh`: the push clone's `fetch origin` and the pin's
  fetch → `halt()`, which writes the stop file.
- `session()` in `bun/board-loop-session.ts` keeps a session's text output
  and nothing of why it ended. A session the Claude API ended prints
  `API Error: …` as its final message: the pick then refuses for want of a
  `PICK:` line, and the stage ends `open` on the goal check.

`request()` and `client()` already tell an unanswered call (the `fetch` threw,
a timeout included) from an answered one, and know the status. The mint is a
separate process (`github-app-mint.ts`) whose failed call exits 1.

`readPullRequests()` failing already passes a change over rather than
pausing, and a Windmill or Access failure before `pass.sh` runs fails the job
but writes no stop file, so neither needs a change.

## Goals / Non-Goals

**Goals:** a pass ended by a network failure, a timeout, a 5xx or a 429 from
GitHub, Notion or the mint, or by a pick or stage session that the Claude API
ended the same way, skips the tick with no stop file; three in a row pause as
today; a real failure still pauses at once.

**Non-Goals:** retrying inside the pass (the next tick is the retry); the
subscription's usage limit, which `loop-every-stage` group 1 makes an outcome
of its own, `limited`; the triage session's API error, whose failure is
already a note that changes nothing; `bun install` failing on the network; the
goal check's reads; telling the user about a pause (card *Tell the user when
the loop pauses a clone*).

## The answers on the card (2026-10-25)

1. Three transient failures in a row pause the clone.
2. A skipped tick exits 75: the Windmill job shows red, and no stop file is
   written.
3. `pass.sh`'s own two fetches always count as transient; the third pauses.
4. The Claude API's transient errors in the pick and stage sessions are in
   this change (*A session ended by a transient Claude API error*). The user
   asked whether the runner can do anything with them: it cannot fix them,
   and Claude Code already retries each one itself before the session ends
   on it; what the runner can do is recognise that ending and end the pass
   `retry` instead of a pause, so the next tick tries again.
5. to 11. Accepted as posted: classification where the status is known, the
   `retry` call sites, no retry inside a pass, the non-goals, the overlaps,
   the step branch kept, and the runner image rebuilt after merge (4.1).

## Decisions

### A `Transient` error, classified where the status is known

`bun/transient.ts` holds `class Transient extends Error`, `TEMPFAIL = 75`,
`answered(status)` (5xx or 429) and `network(stderr)`, over git's stderr:
first false for an HTTP 4xx other than 429 anywhere in it (`HTTP 413`,
`returned error: 403`), since git prints `RPC failed` beside a permanent
rejection too; then one regex: `Could not resolve host`, `Failed to connect`,
`timed out`, `Connection (refused|reset)`, `returned error: (5\d\d|429)`,
`RPC failed`, `early EOF`, `unexpected disconnect`, `Empty reply from
server`. `request()`
and `client()` throw `Transient` where they throw today for a rejected
`fetch` or such a status; the message is unchanged. A rejected `fetch` is
then only a transport failure or the call's own timeout: each builds its URL
with `new URL()` before the `fetch` and outside its catch, so a malformed
configured base (`GITHUB_API_URL`, `HARNESS_NOTION_API_URL`) throws a plain
`Error`, and the timeout is the only signal either passes, so no other abort
exists. The mint exits 75 for a `Transient`, and `minted()` throws
`Transient` for exit 75 or when its own limit killed the mint
(`exitedDueToTimeout`, probed in `gh-timeout`); a mint ended by any other
signal (the OOM killer, an external stop) is a plain `Error`. A 4xx other
than 429, an unreadable key, a bad answer shape: plain `Error`, as today.

Classification by the thrown class or a field, never by matching a message
the runner prints. Two messages are matched: git's stderr, the only structure
git gives, and the usage limit's result text below, which no field this
change could observe tells apart.

### A session ended by a transient Claude API error

`session()` adds `--output-format json`, so `claude -p` prints one result
object, and returns its `result` as `out`, the text the runner reads today,
and `transient`. A probe on 2026-10-25 with Claude Code 2.1.308, against a
local stub API with `CLAUDE_CODE_MAX_RETRIES=0`, showed every API failure
exiting 1 with `is_error: true`, `terminal_reason: "api_error"` and:

| Stub answer | `api_error_status` | `result` opens |
| - | - | - |
| connection refused | `null` | `API Error: Connection refused` |
| 529 | 529 | `API Error: 529 Overloaded.` |
| 500 | 500 | `API Error: 500 Internal server error.` |
| 429 | 429 | `API Error: Request rejected (429)` |
| 401 | 401 | `Invalid API key` |

So `transient` is `is_error`, `terminal_reason` `api_error`, and a status of
`null` (no answer, a timeout), 5xx or 429, with a `result` that does not open
`You've hit your`: the errors reference's form of the subscription's usage
limit (`You've hit your session limit · resets 3:45pm`), which an API key
cannot produce, so the probe could not show whether it carries 429. That
limit is `loop-every-stage`'s: its task 1.1 measures the real form and its
group 1 ends the pass `limited`; until then the limit ends a pass as today.
The prefix is `LIMITED` in `bun/transient.ts`, for that change to take over.
Output that is not one result object (a crash, a test's stub) is `out` as
printed and never transient. `session()` also returns `printed`, the output
as `claude` printed it: `ci-run.ts` already asked for JSON output and reads
`structured_output` from the whole object, so it reads `printed` and drops
its own `--output-format json`, which `session()` now passes. Claude Code retries a transient error ten times
with backoff before it ends the session, so the pass sees only one that
outlasted those; `CLAUDE_CODE_RETRY_WATCHDOG` stays unset, since its three
hours of retries would meet the session's hour as a `timeout`.

A pick session ended so ends the pass `retry` through `refuse()`; a card it
claimed stays claimed and is taken first next time (*A card the pick moved
SHALL stay where the move left it*). A stage session ended so ends it `retry`
before the post and the push, when the session's clone has no tracked edit:
its commits stay on the step branch for the next pass to continue. With a
tracked edit left the pass ends `open` naming the API error, since the next
pass would refuse that tree anyway (*The runner is the user's script and
starts from a clean clone*) and the runner commits nothing of a session's.

### One `retry` outcome, exit 75

`end("retry", …)` exits `TEMPFAIL`. Six call sites, the pick and the stage
session's (above) and:

- the start's fetch: `refuse()` takes the outcome, so the switch back to a
  noted branch still happens;
- the identity/`own()` `try`: `error instanceof Transient`;
- `publish()` returns a `Transient` in place of the reason string for
  `carry()`'s `origin` fetch, the mint and a push whose stderr is `network()`;
- `post()` prints `question: not posted — Notion did not answer: <why>`, a
  prefix exported as `UNREACHED` beside `POSTED` and `ALREADY`, for a
  `Transient` from its reads or the question's comment; `open()` ends `retry`
  for it. A failed `Assign` write or answer comment keeps today's line, since
  the question is posted.

75 is `EX_TEMPFAIL` from `sysexits.h`; nothing else the runner exits uses it.
`pass.sh`'s `flock -E 75` is its own status for a held lock, read before the
runner starts, so the two never meet.

A retry discards nothing: the step branch a session committed to is
continued by the next pass (`A step branch a session left is continued`), at
the cost of a stage session that finds the work done.

### The wrapper counts; the runner does not

`pass.sh` keeps `$state/<clone>.retries`, one number. On 75: add one; at 3,
`pause 75 "<last line> (3 transient failures in a row)"` and remove the count;
otherwise no stop file. On any other status the count is removed. A busy
lock (exit 0 before any pass) and a paused tick (3) leave it. The wrapper's
own two fetches go through a `skip()` beside `halt()` that does the same with
its message, since the pin's checkout cannot have run yet; the pin's
`checkout` and `clean` keep `halt()`.

The wrapper's fetches count as transient without reading git's stderr: the
classifier is TypeScript and the harness checkout that holds it is what the
pin fetch is fetching. Both fetches are anonymous HTTPS to `github.com`, so a
real failure there (a deleted repository, a pin naming a commit that is gone)
pauses on the third tick, three hours late.

The count lives in the wrapper because only it outlives a pass; a runner
started by hand from a terminal exits 75 and stops a shell loop as any
non-zero status does.

### Overlaps

- `no-pause-on-question` (archived 2026-10-25): its orchestrator delta
  modifies the same stop-file requirement, so this change names it in
  `after:` and carries its `waiting` scenario in the full text.
- `runner-isolation` 6.1 authenticates the same two fetches (`pass.sh`'s push
  clone, `carry()`'s): the same lines, no shared requirement; whichever lands
  second merges. Once those fetches carry a token, a 401 there is real, and
  `pass.sh`'s fetch would want the stderr check: noted for 6.1.
- *Tell the user when the loop pauses a clone*: the third retry's stop file is
  a pause it reports; a skipped tick is not.
- `loop-every-stage` (#257) group 1 moves `consider()` and `left()` out of
  `bun/board-loop.ts` as task 2.1 here does, to the same
  `bun/board-loop-candidates.ts`; whichever lands second drops its move. Its
  `limited` outcome takes the usage limit this change leaves out, from the
  same result object `session()` now reads.

## Risks / Trade-offs

- [A real outage reads as transient for three hours] → the third pauses; the
  stop file names the count.
- [git's stderr wording changes] → `network()` misses and the pass pauses, as
  today: the safe side.
- [Windmill shows a skipped tick red] → it exits 75, not 0: something failed,
  and Runs keeps showing it; only the stop file is withheld.
- [The mint image is rebuilt later than the pin moves] → the old mint exits 1,
  read as real: a pause, as today, until the image is rebuilt.
- [A stage session dies mid-edit] → a tracked edit left ends `open`, a pause,
  as a session past its hour does today; only a session that committed what
  it had retries.
- [The usage limit's text changes before `loop-every-stage` lands] → a limit
  read as transient retries three times and pauses: today's pause, three
  hours late.
- [JSON output prints the last turn's result alone] → text output printed
  every turn's; the runner reads only the final message's lines, so nothing
  it parses moves.
