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

**Goals:** every pause reaches the user once, from the integration, with what
they need to act: the clone, the stop line, the log's path, the resume command.

**Non-Goals:** a notice on the step's own card (see *One status card*); a
channel outside Notion (mail, push); telling transient failures apart (card
*Skip a tick on a transient failure*); clearing `Assign` on resume; a notice
for a stop by hand.

## Decisions

### Notified where the stop file is written

`pause()` is the one place every pause passes through, and it runs once per
pause, so the hook there needs no dedup state. The runner's `end()` would miss
the host's halts and a runner that died (127, a signal). `pause()` runs the
command `PASS_NOTIFY` names, split on spaces as `PASS_AS_AGENT` is, with the
stop file and, when it exists, the log, and ignores its status. Unset, nothing
runs: a laptop's `pass.sh` and the existing tests stay as they are.

The forced command in `orchestrator/runner/entrypoint.sh` sets
`PASS_NOTIFY="bun --config=/dev/null --no-env-file /opt/orchestrator/bun/notion-pause.ts"`:
the image's copy, so a halt before the pin's checkout still notifies, and with
the flags the runner's own bun takes, since `pause()` may run in the push
clone, whose `bunfig.toml` and `.env` are a branch's.

### One status card

The notice goes to one fixed card, the *loop status* card, which the runner's
`notion-bot.json` names as `pauses` (a Notion id, checked as `user` is). It
covers every pause, a halt before any pick included, with one code path. The
step's card is not known to `pass.sh`, and the runner knows only the slug: a
notice there would need a data-source query by `Pointer` and a second path for
pauses with no step. The stop line already names the step (`apply <slug> step
<n>`).

One card per host, not per repository: the notice names the clone and its
repository. The card has no `Pointer`, so the pick never takes it.

### The comment

One page-level comment from the integration: a code run `harness-pause`, a
mention of the user (`settings().user`), then plain text:

```
The board loop paused the clone <clone>: <stop line>
Log: <log path> (or: no log, the pass did not start)
Resume: docker compose exec -u runner runner rm <stop file>
```

The mention is what notifies: a second `Assign` write to a card whose `Assign`
already holds the user notifies nobody. `Assign` is still set, so the card
shows in the board's `Questions` view. `comment()` gains an optional user to
mention after the mark; its chunking stays. The stop line is cut at 1000
characters, since a crashed runner's last line is arbitrary.

The `Assign` write `post()` makes is lifted into `assign(call, card, user)` in
`notion-bot.ts`, and `post()` switches to it in the same change.

### Failures print, never pause twice

`bun/notion-pause.ts` prints one line: `pause: notice posted on <card>, Assign
set`, `… Assign not set — <why>`, or `pause: no notice — <why>` (no settings,
no `pauses`, the post failed). It exits 0 whatever happens, and `pass.sh`
ignores its status too, so the pause, the stop file and the job's status are
those of today. No call is retried: a retry could post twice.

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
