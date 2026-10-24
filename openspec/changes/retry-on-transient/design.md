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

`request()` and `client()` already tell an unanswered call (the `fetch` threw,
a timeout included) from an answered one, and know the status. The mint is a
separate process (`github-app-mint.ts`) whose failed call exits 1.

`readPullRequests()` failing already passes a change over rather than
pausing, and a Windmill or Access failure before `pass.sh` runs fails the job
but writes no stop file, so neither needs a change.

## Goals / Non-Goals

**Goals:** a pass ended by a network failure, a timeout, a 5xx or a 429 from
GitHub, Notion or the mint skips the tick with no stop file; three in a row
pause as today; a real failure still pauses at once.

**Non-Goals:** retrying inside the pass (the next tick is the retry); the
Claude API's own errors in the pick or stage session; `bun install` failing on
the network; the goal check's reads; telling the user about a pause (card
*Tell the user when the loop pauses a clone*).

## Decisions

### A `Transient` error, classified where the status is known

`bun/transient.ts` holds `class Transient extends Error`, `TEMPFAIL = 75`,
`answered(status)` (5xx or 429) and `network(stderr)`, one regex over git's
stderr: `Could not resolve host`, `Failed to connect`, `timed out`,
`Connection (refused|reset)`, `returned error: (5\d\d|429)`, `RPC failed`,
`early EOF`, `unexpected disconnect`, `Empty reply from server`. `request()`
and `client()` throw `Transient` where they throw today for a rejected
`fetch` or such a status; the message is unchanged. The mint exits 75 for a
`Transient`, and `minted()` throws `Transient` for exit 75 or for no exit
status (killed at its limit). A 4xx other than 429, an unreadable key, a bad
answer shape: plain `Error`, as today.

Classification by the thrown class, never by matching a message the runner
prints. The one place a message is matched is git's stderr, which is the only
structure git gives.

### One `retry` outcome, exit 75

`end("retry", …)` exits `TEMPFAIL`. Four call sites:

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

- `no-pause-on-question` (merged, not archived): its orchestrator delta
  modifies the same stop-file requirement, so this change names it in
  `after:` and carries its `waiting` scenario in the full text.
- `runner-isolation` 6.1 authenticates the same two fetches (`pass.sh`'s push
  clone, `carry()`'s): the same lines, no shared requirement; whichever lands
  second merges. Once those fetches carry a token, a 401 there is real, and
  `pass.sh`'s fetch would want the stderr check: noted for 6.1.
- *Tell the user when the loop pauses a clone*: the third retry's stop file is
  a pause it reports; a skipped tick is not.

## Risks / Trade-offs

- [A real outage reads as transient for three hours] → the third pauses; the
  stop file names the count.
- [git's stderr wording changes] → `network()` misses and the pass pauses, as
  today: the safe side.
- [Windmill shows a skipped tick red] → it exits 75, not 0: something failed,
  and Runs keeps showing it; only the stop file is withheld.
- [The mint image is rebuilt later than the pin moves] → the old mint exits 1,
  read as real: a pause, as today, until the image is rebuilt.
