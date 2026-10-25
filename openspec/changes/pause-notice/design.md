## Context

Every pause goes through `pause()` in `orchestrator/pass.sh`: `halt()` for a
host that cannot start the pass as designed (the token, the App's settings, the
hooks directory, the push clone, the pin), a failed `flock`, and any non-zero
exit of the runner. `pause()` writes `<state>/<clone>.stop` with the time, the
status and the last line. The ticks after it exit 3 in `paused()` before any
of that, and `stop.sh` writes its own `stopped by hand` while the TERM it sends
ends `pass.sh` too, so `pause()` runs once per pause and never for a stop by
hand.

The runner's Notion integration already posts questions over REST
(`bun/notion-bot.ts`: `settings()`, `client()`, `comment()`, and the `Assign`
write inside `post()`), with its settings at
`/home/runner/.config/harness/notion-bot.json`. The runner image holds a
root-owned copy of `bun/` at `/opt/orchestrator/bun/`, which the event handler
already runs from, independent of the pin `pass.sh` checks out.

## Goals / Non-Goals

**Goals:** every pause reaches the user once, from the integration, on the card
of the step that stopped, or on a card of its own when no step's card is
known, with what they need to act: the clone, the stop line, the log's path,
the resume command.

**Non-Goals:** a channel outside Notion (mail, push); telling transient
failures apart (card *Skip a tick on a transient failure*); clearing `Assign`
on resume, which the user does (answer 3); a notice for a stop by hand.

## Answers on the card (2026-10-25)

The card's question numbered its items 1 to 11; the user answered:

1. The notice goes on the card whose step stopped the loop, with its `Assign`
   set to the user. A pause tied to no existing card files a new card that
   describes why the loop stopped, at `approved`, assigned to the user. See
   *The step's card, or a card of its own*, which replaces the earlier *One
   status card*.
2. (a): a comment mentioning the user, and `Assign`. See *The comment*.
3. (a): the user clears `Assign` when they remove the stop file; the runner
   never does.
4. to 8. Kept as written: the hook in `pause()` (*Notified where the stop file
   is written*); no settings, no notice (*Failures print, never pause twice*,
   with the key now `board`, not `pauses`); the stop file and the exit status
   unchanged, no retry; the image's copy run through `PASS_NOTIFY`; the
   overlaps below.
9. Changed by answer 1: no status card. The board the notice searches and
   files on is the one data source `board` names in `notion-bot.json`, one per
   host.
10. Kept: the stop line is cut at 1000 characters.
11. Changed by answer 1: after the merge the user adds the board's data source
    id as `board` to `notion-bot.json` and rebuilds the runner; no card is
    created by hand.

## Decisions

### Notified where the stop file is written

`pause()` is the one place every pause passes through, and it runs once per
pause, so the hook there needs no dedup state. The runner's `end()` would miss
the host's halts and a runner that died (127, a signal). `pause()` runs the
command `PASS_NOTIFY` names, split on spaces as `PASS_AS_AGENT` is, with the
stop file and, when it exists, the log, and ignores its status. Unset, nothing
runs: a laptop's `pass.sh` and the existing tests stay as they are.

The forced command in `orchestrator/runner/entrypoint.sh` sets
`PASS_NOTIFY="timeout 300 bun --config=/dev/null --no-env-file /opt/orchestrator/bun/notion-pause.ts"`:
the image's copy, so a halt before the pin's checkout still notifies, and with
the flags the runner's own bun takes, since `pause()` may run in the push
clone, whose `bunfig.toml` and `.env` are a branch's.

### The step's card, or a card of its own

The step is read from the stop file's line, never from the log, which holds
the sessions' untrusted output: only when the line records exit 1 and its text
opens with the runner's `board-loop: ` does the command take the slug from the
first `apply <slug> step <n>` after it, the target `end()` puts before any
session's words (`open`, `timeout`, and a `refused` naming a process group
that outlived the step). Any other line, a halt's, a crash's or a refusal
before the pick, names no step.

With a slug, the command queries the data source `board` names for the cards
whose `Pointer` reads `openspec/changes/<slug>/`, as the pick reads it. One
card: the notice goes there. None or several: no card is guessed, and the
pause is treated as tied to no card.

A pause tied to no card files a new card on that data source: its `Name`
`The loop paused <clone>`, `Status` `approved`, `Assign` the user, no
`Pointer`, so the pick never takes it, and as its body the notice's text and
why no step's card took it (the line names no step; no card's, or several
cards', `Pointer` names the slug). The comment then follows on that card as on
a step's, so the mention notifies on both paths.

`board` is the data source's id, not the board's name the repository's
`package.json` holds: a halt can come before any clone is checked out, and a
new card needs a data source to be filed on. It is checked with `ID`, as
`user` is.

### The comment

One page-level comment from the integration: a code run `harness-pause`, a
mention of the user (`settings().user`), then plain text:

```
The board loop paused the clone <clone>: <stop line>
Log: <log path> (or: no log, the pass did not start)
Resume: docker compose exec -u runner runner rm <stop file>, then clear this card's Assign
```

The mention is what notifies: a second `Assign` write to a card whose `Assign`
already holds the user notifies nobody. `Assign` is still set on a step's
card, so it shows in the board's `Questions` view; a new card has it from its
creation. `comment()` gains an optional user to mention after the mark; its
chunking stays. The stop line is cut at 1000 characters, since a crashed
runner's last line is arbitrary. `harness-pause` is neither mark the pick or
the question gate reads, so the notice is never taken for a question or an
answer.

The `Assign` write `post()` makes is lifted into `assign(call, card, user)` in
`notion-bot.ts`, and `post()` switches to it in the same change.

### Failures print, never pause twice

`bun/notion-pause.ts` prints one line: `pause: notice posted on <card>, Assign
set`, `pause: notice posted on new card <card>`, `… Assign not set — <why>`,
or `pause: no notice — <why>` (no settings, no `board`, the query, the card's
creation or the post failed). It exits 0 whatever happens, and `pass.sh`
ignores its status too, so the pause, the stop file and the job's status are
those of today. No call is retried: a retry could post or file twice.

### Settled while applying group 1

- The query's results are read again for a `Pointer` whose plain text is
  exactly `openspec/changes/<slug>/`, as the pick reads it: the `equals`
  filter's match is Notion's, and the check is the command's.
- `Status` is written as a `select`, the type the Harness board's `Status`
  has; the new card's body is one paragraph per line of the notice, then
  `No step's card took this notice: <why>.`
- When the comment's post fails after the new card was filed, the line names
  the card: `pause: no notice — <why> (new card <card> filed)`, so the user
  can find it.

### Settled while applying group 2

- `pass.sh` sets `log` empty before `pause()` can run, so a halt names no log
  even when the environment holds a `log`, and a halt after `log` is named but
  before the pass created it names none either.
- The command's line reaches the job's output when `pause()` runs: before the
  pass's output, which `pass.sh` prints afterwards, and before a halt's own
  line, so the job's last line is the one it is today.
- The command runs while the pass's lock is held, as `pause()` does, and that
  lock also gates the deploy, so the forced command bounds it with coreutils'
  `timeout 300` (in the Debian base image): its at most four Notion calls are
  bounded at 30 s each, and 300 s leaves margin for bun's start. A deadline
  that ends it exits 124, which `pause()` ignores as any other status.

### Overlaps

- `no-pause-on-question` (merged): a `waiting` pass exits 0, so it writes no
  stop file and posts no notice.
- *Skip a tick on a transient failure*: it decides when `pause()` runs; the
  notice follows that decision with no change here. Both edit `pause()` in
  `pass.sh`, so the second to merge rebases over the first.
- *Route every Notion write the loop makes through the bot integration*: this
  notice is one more write from the integration, as that card wants. Both edit
  `notion-bot.ts` around `Assign` (that card clears it on a pull request); the
  lifted `assign()` is the place both use.

## Risks / Trade-offs

- [The image's copy of `bun/` lags main] → the notice runs from the image's
  build, as the event handler and `pass.sh` itself do; a change to either
  reaches the host with `docker compose up -d --build`, README section 4.
- [A stop line holds a secret] → the runner's lines name no token by design;
  the 127/signal case carries the log's last line, which already reaches
  Windmill's output. Capped at 1000 characters.
- [Notion is down when the pass pauses] → the notice is lost and the line says
  so in the job's output; the pause stands, as today.
- [The user ignores mentions] → `Assign` and the `Questions` view still show
  the card.
- [A step's card has a question open when its pass pauses, as when a gate line
  holds back the pull request after the question was posted] → a reply of the
  user's to the notice would read as that question's answer; the notice asks
  for none, and README section 7 says to answer the question, not the notice.
- [A repository whose board is not the one `board` names] → its step's card is
  not found there, so the pause files a new card on that board. One board per
  host, as the host serves today.
