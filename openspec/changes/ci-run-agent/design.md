# ci-run-agent — design

## Context

`vps-board-loop` builds the host: a runner container with the Unix users
`runner`, who alone reads the secret files under `/run/secrets`, and `agent`,
who runs every `claude` session; the clones under `/home/agent/clones`; the
runner's state under `/home/runner/orchestrator`; one `flock` per repository,
taken by `pass.sh`. `github-app-identity` keeps every GitHub token out of a
session. Its step 1 has merged: `board-loop-push.ts` pushes and opens the pull
request, and `board-loop-session.ts` hands a session an allowlisted
environment. Its step 2, being applied, adds `bun/github-app.ts`, which mints a
token for one repository after the session ends.

Settled on the card (explore 2026-10-18, user decisions the same day), fixed
here and not reopened:

1. The event is `workflow_run`, action `completed`. The flow reacts only to
   `conclusion: failure`.
2. It acts only on this repository, never a fork, and only on branches `feat/`
   and `spec/`.
3. The failed jobs' logs are read with `gh run view <id> --log-failed`. CI
   gains no new gate line.
4. The agent is `claude -r <session> -p "…"` in a clone. It fixes in a new
   commit, never by force, or answers `BLOCKED —`. It answers through
   `--json-schema`.
5. At most 3 fix attempts per pull request, then `BLOCKED` and a question on
   the card. The count is kept somewhere durable on GitHub.
6. A failed scheduled run with no pull request files an `idea` card on that
   project's board.
7. A flaky run is a finding, never re-run until green.
8. n8n's GitHub Trigger has no `workflow_run`, so the entry is a plain webhook
   whose HMAC the receiver checks. The CodeRabbit flow will share that entry.

## Goals / Non-Goals

**Goals:** one handler every event flow enters through, which needs no engine
feature beyond receiving a request and running a command. A CI flow whose
loop is bounded by state anyone can read on the pull request.

**Non-Goals:** the proposal's. Besides those: no queue, and no retry of a
dropped event. GitHub's redelivery and the later `pr-sweep` cover a lost
event.

## Decisions

### The engine's contract: one argument, the body on stdin

The engine answers GitHub itself, at once, with a 2xx, since GitHub waits ten
seconds for a reply and a fix runs for an hour. Then it runs, as `runner`:

```text
bun /opt/orchestrator/bun/on-event.ts '<event> <delivery> <signature>'
```

The three header values (`X-GitHub-Event`, `X-GitHub-Delivery`,
`X-Hub-Signature-256`) go in one argument, separated by single spaces. The
body's bytes go on standard input, unchanged. They are one argument because
the values come from the internet unverified. A forced SSH command passes
`"$SSH_ORIGINAL_COMMAND"` whole, so no shell splits or globs them. The handler
checks each value against an anchored pattern before it reads the body:
`^[a-z_]+$`, a GUID, and `^sha256=[0-9a-f]{64}$`. It reads at most 25 MiB,
GitHub's payload cap, and refuses more.

It prints one line, `event: <verdict> — <reason>`, and exits 0 for an event it
handled or ignored, 2 for one it refused (shape or signature), and 1 for a
flow that failed. How the engine reaches the runner is wiring, outside this
design. For an SSH call it is a second key beside `pass.sh`'s, whose forced
command is the line above. With this contract, `vps-board-loop`'s spike
criterion becomes "the engine passes the raw body and the three headers
unchanged". Rejecting a wrong signature and dropping a repeated delivery are
now the handler's job.

The handler runs from the runner image's copy of `bun/`, built at the
harness's pin. It never runs from a clone, because `agent` can write to every
clone and the handler reads the webhook secret and the App's key.

### The signature is checked before anything is parsed

The secret is `github_webhook_secret` in the secrets directory `pass.sh` reads,
`PASS_SECRETS` or `/run/secrets` by default, so a test points it at a
temporary directory (PR review). It is a compose secret file like
`vps-board-loop`'s others: owned by the runner's uid, mode 0400, never in
n8n's store and never in a session's environment. The handler reads it whole,
trimming one trailing newline. A missing, empty or whitespace-only file is
exit 1, naming the path. It computes `sha256=` plus the hex HMAC-SHA256 of the
raw bytes and compares the two with `timingSafeEqual`, after checking their
lengths. Only then does it parse the JSON.

### A delivery id is a file created exclusively

After the signature, the handler writes its own pid to a temporary file
beside `~/orchestrator/deliveries/<delivery>`, then `link()`s it to that
name. The link fails when the name exists, so the marker appears whole or
not at all, and of two simultaneous copies one loses. Just before a flow
first posts to GitHub or starts a session, the handler writes `acted` to a
temporary file and renames it over the marker, so a kill mid-write never
leaves it half rewritten (PR review).

A delivery whose file exists is a duplicate, exit 0, unless the file holds a
pid that is no longer running (`kill(pid, 0)` answers `ESRCH`), or holds
neither a pid nor `acted`. That handler ended before acting, by an exit or by
being killed, so the file is replaced and the delivery handled. This covers the crash a removal on exit would miss
(local and PR review, 2026-10-20). The replacement is exclusive: the handler
first renames the dead marker to `<delivery>.<own pid>.dead`, then creates
its own through the same temporary file and `link()`, and removes the
tombstone. A rename is atomic, so when two handlers find one dead marker only
one rename succeeds; the other's fails with `ENOENT`, and it treats the
delivery as a duplicate (PR review). A rename that comes after the other
handler's recovery takes its live marker instead, so the handler compares the
tombstone with the content it judged dead, and on a difference links the
tombstone back and treats the delivery as a duplicate (apply, 2026-10-21).
`shortcut: a third copy arriving between that rename and the link back also
wins; record it if a delivery is ever seen handled twice.` An `acted` file, or the pid of a handler
still waiting on the lock, keeps the delivery a duplicate. GitHub retries
nothing the engine answered with a 2xx, so a redelivery is the user's, from
the webhook's *Recent deliveries*. `shortcut: a recycled pid reads as still
running and drops the redelivery; record the process start time beside the
pid if that is ever seen.` `shortcut: the directory is never pruned (a few
bytes per delivery); prune by age once it holds more than a few thousand.`

### Routing is a table of event names

`on-event.ts` maps `workflow_run` to `bun/ci-run.ts`, and later flows add
their names. Any other event, `ping` included, is `ignored` with exit 0,
before the App's settings are read, so a webhook's `ping` reads `ignored`
before the App exists (PR review). An event a flow takes needs the App's
settings: without both, the handler refuses it. The attempt count is the
App's comments, and no flow may push as the user. So no flow runs on the
laptop.

### The CI flow's order

1. Filter, from the payload alone. Ignore unless the action is `completed`
   and the conclusion `failure`. Ignore a fork:
   `workflow_run.head_repository.full_name` must equal
   `repository.full_name`.
2. Route. A run whose `event` is `schedule` on `repository.default_branch`
   takes the scheduled route. Any other run needs a branch starting `feat/` or
   `spec/`, and takes the pull request route. Everything else is ignored,
   naming the filter.
3. Find the clone. For a pull request, the clone is the one the table names.
   For a scheduled run, it is `/home/agent/clones/<repository name>`. In both
   cases the clone's `origin`, parsed as `github-app.ts` parses it, must name
   the repository. Otherwise the run is ignored as having no clone.
4. Take the repository's lock: the file `pass.sh` locks, keyed from the
   clone's `origin` as `pass.sh` derives it, never from the payload. The
   handler waits on it with `flock -w 7200` where `pass.sh` uses `-n`, because
   a dropped event is lost and a pass ends within its hour. At the bound it
   exits 1. Bun opens no `flock` of its own, so the flow re-runs
   `ci-run.ts` under `flock`, the payload on its stdin, and reads that
   process's verdict from its last line (apply, 2026-10-21). It holds the lock until the push and the clone's cleanup after the
   session have ended, so the check and the post in *Attempts* are one step
   against every other delivery, and no pass writes to the clone or pushes
   while the flow still does (PR review).
5. Mint the token for this repository with `actions: read`, `contents: write`
   and `pull_requests: write`. `github-app.ts` gains a permissions argument.
   Then re-read, under the lock, the run (`GET /actions/runs/<id>`) and the
   pull request.
6. The pull request route goes on in *Attempts*. The scheduled route starts a
   fresh session.

### The PR → session table

- **Where:** `~/orchestrator/pr-sessions.jsonl`, in the runner's home, which
  on the host is the runner's own volume. `agent` cannot read it, so a session
  cannot redirect another pull request's resume. On the laptop the same runner
  writes the same path under the user's home, and nothing reads it.
- **Who writes it:** the board-loop runner. It starts every stage session with
  `--session-id <crypto.randomUUID()>`. Just before `board-loop-push.ts` pushes
  the step's branch, it appends one line:
  `{"repo":"<owner>/<name>","branch":"<b>","session":"<uuid>","clone":"<dir>","at":"<ISO UTC>"}`.
  It writes with one `appendFileSync`; a line well under 4 KiB is appended
  whole. The directory is created mode 0700 and the file 0600; a file that
  already exists is set to 0600 before the append, and when its last line
  lacks a newline, as an interrupted write leaves it, the record starts with
  one (CodeRabbit on #198). `repo` comes
  from the App's settings or from a GitHub `origin`; any other `origin`
  records it empty, a line the lookup skips, since its URL can hold a
  credential. A failed write pushes nothing and the pass records `open`, so no
  pull request exists that the flow cannot find. Keyed by branch rather than
  pull request number because the number exists only after the push, and a
  record written after it could fail with the pull request already open (local
  review, 2026-10-20). A step's branch is never reused across steps, since a
  squash-merged branch is never freed (`git-and-prs.md`).
- **Lookup:** the event's `head_branch` gives the branch; the open pull
  request on it comes from GitHub. The last line whose `repo` and `branch`
  match wins, so a step that a later session continued resumes the later
  session. A line that does not parse, or lacks a field, is skipped. A branch
  matching no line has no session. The open pull request's author must also
  be the App's `<slug>[bot]`, which opens every pull request of the loop's
  on the host. A record holds when the push succeeded and `gh pr create`
  failed; a pull request someone else then opens on that branch is not the
  loop's, and has no session (PR review).
- **No session:** the flow starts nothing and posts nothing. A pull request the
  loop did not open belongs to whoever opened it: the user, or a session on the
  laptop that may still be pushing to it. Starting a fresh session there would
  put two writers on one branch. This is the reason the table exists rather
  than a match on the `feat/` and `spec/` prefixes alone.

### Attempts are the App's marked comments on the pull request

On the pull request route, after the re-read and the refusal of a tracked
edit in the clone (*The session*), which so costs no attempt:

1. If the pull request is closed, or its head has moved off the run's
   `head_sha`, the run is stale and ignored.
2. If the run's latest attempt has the conclusion `success` and its
   `run_attempt` is greater than the event's, the run is flaky. Start a fresh
   session with the flaky prompt, and post no attempt. If its `run_attempt`
   is greater and it has not succeeded, it is running or failed, and its own
   event follows; this one is stale and ignored, so no attempt is spent on
   the older attempt's logs (PR review).
3. List the pull request's comments. Keep those whose author is the App's
   `<slug>[bot]` (from `GET /app`) and whose body opens with
   `` `harness-ci-attempt` `` or `` `harness-ci-limit` ``. A limit comment
   means ignore. An attempt naming this `head_sha` means ignore, which covers
   two workflows failing on one commit. Three attempts mean: post the limit
   comment, resume the session with the limit prompt, and push nothing.
4. Otherwise, post `` `harness-ci-attempt` n/3 — <run URL> at <head_sha> `` and
   resume the session with the fix prompt.

The attempt is posted before the session starts. A session that crashes has
still used an attempt, which keeps the bound at three sessions however they
end. The user resets the count by deleting the App's comments.

The alternatives:

- **Commit statuses.** The App holds them read-only, as the user settled in
  `github-app-identity`. A status also hangs on a commit, not a pull request,
  so counting needs every commit's statuses.
- **Labels.** A label is a state, not a count: either a numbered label
  rewritten each time, or three labels. Neither says which run it was.

Comments are append-only, and the user reads them in the pull request's
conversation. Listing and posting them needs *Pull requests* read and write,
which the App already holds (GitHub's permissions table for
`/repos/{owner}/{repo}/issues/{n}/comments`, read 2026-10-20). Reading a run
and its logs needs *Actions: read*, which the App lacks, so adding it is a
user act. The author check is what keeps a pasted mark from counting
(`rules.md` Code).

### The session

Before the session, the runner works in the clone:

- It notes the branch the clone is on.
- It refuses a tracked edit, as the board loop does.
- It fetches the pull request's branch, switches to it and fast-forwards it.
  `HEAD` must then be the run's `head_sha`.
- It writes `gh run view <id> -R <repo> --attempt <n> --log-failed` to
  `/home/agent/ci-logs/<run>-<n>.log`, readable by `agent`'s group. `<n>` is
  the event's `run_attempt`, never the run's latest: a re-run started since
  would otherwise hand the session another attempt's logs, or none (local
  review, 2026-10-20).

The runner runs `gh` here with the token in `GH_TOKEN`, so no token is ever in
a session (`github-app-identity`, decision 3). The command is the settled one;
only who runs it differs.

The session runs as `agent`, with the allowlisted environment and the board
loop's one-hour limit:

```text
claude -r <session> -p '<prompt>' --json-schema '<schema>' --output-format json --permission-mode auto --permission-prompts none
```

`board-loop-session.ts`'s `session()` gains the extra flags, so the process
group and the limit are handled once. The schema:

```json
{"type":"object","required":["outcome","summary"],"additionalProperties":false,
 "properties":{"outcome":{"enum":["fixed","blocked","flaky"]},"summary":{"type":"string"}}}
```

The fix prompt names the run, the workflow, the log file and the attempt `n/3`.
It asks the session to:

- read the log file, never `gh`;
- fix the failure in new commits on the branch, with no amend, rebase or push;
- or, when it cannot, put one question on the card under the question gate's
  mark and answer `blocked`;
- or, when the failure is no defect of the branch, answer `flaky` and file the
  card `core/testing.md` asks for.

The limit prompt asks for no change, one question on the card naming the pull
request and the three attempt comments, and `blocked`.

The flaky and scheduled routes start a fresh session with `--session-id` and
record no line. The flaky prompt files the flaky card naming the failed
attempt's tests. The scheduled prompt files an `idea` card on the board the
clone's `package.json` names under `harness.board`, naming the workflow and the
run, unless a card that is not `done` already names that workflow. Neither
changes a file. The runner checks that `HEAD` and the tree are unchanged.

After the session, the runner first checks the tree. A tracked change or an
untracked file left behind, whatever the outcome, means push nothing, switch
nothing, keep the log file, and exit 1 naming the clone, as the board loop
leaves the branch and tree a session left when it cannot trust them (PR
review). Otherwise it acts on the outcome:

- **`fixed`:** push only when `HEAD` is on the branch,
  `git merge-base --is-ancestor <head_sha> HEAD` holds, and `HEAD` is not
  `<head_sha>`. The push is `board-loop-push.ts`'s, as the App, never by force.
  A refused push is exit 1, neither forced nor retried.
- **`blocked` or `flaky`:** push nothing.
- **No answer that matches the schema:** exit 1 after the cleanup.

Then the runner deletes the log file, switches the clone back to the branch
it found, and only then releases the lock. Unpushed commits stay on the pull
request's branch.

## Risks / Trade-offs

- [`--json-schema` with the harness's `Stop` hooks is unprobed;
  `github-app-identity` set it aside for that reason.] → Group 3 probes it
  first, on a stub session with the turn gate registered. If the hooks swallow
  the answer, the fallback is a last line `CI-OUTCOME: <outcome>`, parsed as
  `PICK:` is. That changes the parse, not the spec. Probed 2026-10-21 on
  Claude Code 2.1.306, in a clone of this repository with the pinned
  harness's hooks: `claude -p … --json-schema <the schema> --output-format
  json --tools ""` returned `structured_output` matching the schema, and the
  turn gate's `mark` and `stop` halves both wrote their state for that
  session. The probe ran without `--permission-mode auto`, which this
  laptop's own auto mode refused to launch, and in a clone that was never
  trusted, so its permission allow list was ignored; neither decides
  whether hooks run. Not probed: a `Stop` hook that refuses the stop, which
  only a session that moved `HEAD` meets.
- [A flaky run is seen only when the user re-ran it before the handler took
  the lock, since `success` is never delivered.] → Accepted. The agent can
  still answer `flaky` from the log, and a later success is the `pr-sweep`'s.
- [A webhook delivered while the engine is down is lost.] → GitHub's
  *Recent deliveries* page can redeliver it by hand, and the `pr-sweep` covers
  it.
- [The handler dies between posting the attempt and starting the session.]
  → Accepted (user, 2026-10-20, PR review): the attempt is used, as a crashed
  session's is, and the redelivery is a duplicate. The `pr-sweep`'s `ci`
  hand-off still names the red head.
- [An hour's pass ahead of a fix delays the fix by up to an hour.] → Accepted.
  One writer per clone matters more than latency.
- [The App's push re-runs CI, and each red run is a session.] → Three attempts
  and the limit comment bound it per pull request.

## Migration Plan

All six groups merge inert: nothing calls the handler until the engine's
workflow is imported and a repository's webhook exists. To stop the flow,
disable the webhook on GitHub. The table and the comments stay, harmless.
