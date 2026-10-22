# vps-board-loop — design

## Context

`bun/board-loop.ts` is one pass: it refuses under `CLAUDECODE`, refuses a
clone Claude Code has not trusted, fast-forwards the clone, runs a pick
session and a stage session (`claude -p`, auto mode,
`--permission-prompts none`), and exits 0 for `met` and `idle` alone. Today
the user starts it from a terminal on the laptop. Nothing in the runner
assumes a terminal. Nothing stops two passes on one clone. The card's explore
of 2026-10-18 found both.

The user settled the following on the card (2026-10-17 and 2026-10-18). They
are fixed here and not reopened, but for the engine, which the spike in task
group 2 puts back to the user (2026-10-20); group 3's n8n-specific decisions
are revised after that answer:

- **Engine: n8n, until the spike's answer**, pinned at 2.38.2 or later. That floor covers
  CVE-2026-56357, fixed in 2.5.0, and CVE-2026-86080, fixed in 2.38.2.
- **Claude on the host through `claude setup-token`** for every unattended
  pass. The token cannot fetch claude.ai connectors, so Notion reaches the
  pick session as a separately configured MCP server. Phone access is the
  orchestrator's own UI, behind auth. The 2026-10-18 decision also had no
  user login on the VPS and gave Remote Control up; the user reversed that
  part on 2026-10-21 (*Remote Control on the host* below).
- **Until the GitHub App lands, the loop pushes as the user**, the way it does
  from the laptop.
- **The n8n workflows, the Dockerfile and compose (and later the router) live
  as a directory in this public repository**, with no secret in it. Every
  sensitive value is substituted on the host.
- **A pass that exits 1 pauses the timer** until the user removes a stop file
  by hand.
- **Domain `hooks.laidrivm.com` on Cloudflare.** The PR sweep runs hourly
  (2026-10-17). The sweep is a later flow, and the timer here runs at the
  same hourly rate.

## Goals / Non-Goals

**Goals:** an hourly pass on the host that never runs twice for one repository
and never resumes after a failure without the user. A host rebuilt from this
tree plus the files only the user holds.

**Non-Goals:** see proposal.md, *Non-goals*. Two more at design level. No
change to the runner's code; only its header comment moves. No measurement on
the VPS by an agent: whatever must be measured there is a user act, or is
read from the first passes' output.

## Decisions

### The directory is `orchestrator/`

It is named for what it is, not for the host it runs on. Later flows (the
router, webhooks) land beside the timer. Layout:

- `compose.yaml`
- `runner/Dockerfile` and `runner/entrypoint.sh`
- `pass.sh`
- `workflows/<id>.json`
- `README.md`
- `*.test.ts`

The host's secrets live in `orchestrator/secrets`, which `.gitignore` lists
with no trailing slash (`rules.md` Safety). The README sits in the directory,
not in the root README, because only someone running the host reads it.
Alternative: `host/`. Rejected, because the router is not host configuration.

### The pass runs in a runner container, reached over SSH

The card's constraint, *Sandbox per agent*, says the App's private key never
enters the agent's sandbox. That key is not n8n's either. On the host a
key-holder user alone reads it and mints `runner` an hourly token
(`runner-isolation`, user, 2026-10-21); `runner` never reads the key file.
This supersedes the ghapp card's 2026-10-18 reading, under which the runner's
own Unix user read it. Sessions run as a third user, `agent`. n8n's
credential store holds only the SSH key that reaches the runner. An agent session inside n8n's container, as the explore sketched
with Execute Command in a custom n8n image, would still read that store (same
uid, `/home/node/.n8n`) and inherit n8n's environment, `N8N_ENCRYPTION_KEY`
included. So:

- n8n runs the stock image. Execute Command stays disabled, as n8n 2.x ships
  it.
- A `runner` service, built from `runner/Dockerfile`, holds git, `gh`, bun,
  `claude`, `openspec`, `coderabbit`, `flock` and `sshd`. This group gives it
  two users; `runner-isolation` group 3 adds the key holder and a second
  sudoers rule, `/opt/orchestrator/mint` as the key holder, and its
  `layout.test.ts` cases pin both rules. `runner` runs `pass.sh` and `board-loop.ts` and alone reads the secret
  files this group provisions; the App's key, which `runner-isolation`
  group 3 adds, is the key holder's alone. Compose mounts file-backed secrets as bind mounts and applies no
  `uid`, `gid` or `mode` to them, so the files keep their host ownership: the
  image gives `runner` a fixed numeric uid, and the host README has the user
  make each file this group provisions under `orchestrator/secrets` owned by
  that uid with mode 0400 and the directory 0500. The App's key is not one of
  them: `runner-isolation` puts it in a directory of its own, owned by the
  key holder's fixed uid with mode 0400, since a 0500 directory `runner` owns
  would keep the key holder out. `/run/secrets` stays traversable; what keeps
  `agent` out is the files' owner and mode. `agent` runs the pick and
  stage sessions: `board-loop.ts` starts `claude` as `agent` through
  `sudo -u agent /opt/orchestrator/as-agent`, the one command this group's
  sudoers rule names (`runner-isolation` *Three users* rejects `setpriv`), with the
  allowlisted environment `github-app-identity` builds, so no session can
  read a secret file or inherit a token beyond what that allowlist passes.
  `agent`'s home is one persistent volume: `~/.claude`, `~/.claude.json`,
  `~/.local/state/harness/gates.jsonl` and the clones, shared with `runner`
  through a common group so the runner can push what a session committed and
  read its pre-PR record. `claude -r` needs only that volume (explore: since
  v2.1.223 it searches every project). `runner`'s home, `/home/runner`, is
  a second persistent volume: it holds `~/orchestrator` (locks, stop files,
  pass logs), which no session can reach. `pass.sh` runs as `runner`, so its
  `~` is that volume, and the forced command below sets its clones directory
  to `/home/agent/clones` through `PASS_CLONES`. Both volumes outlive a
  recreated container.
- n8n's SSH node connects to `runner` on the compose network. No port is
  published. The key's `authorized_keys` line is
  `restrict,command="PASS_CLONES=/home/agent/clones /opt/orchestrator/pass.sh \"$SSH_ORIGINAL_COMMAND\""`,
  written by the entrypoint from a secret file. n8n can name a clone and
  nothing else.
- The SSH node returns the remote command's exit status as data (`code`) and
  does not fail on a non-zero one. The workflow therefore follows it with an
  IF node on `code`, whose non-zero branch ends in a Stop and Error node, so
  a failed or paused pass reads as failed in the execution list. The host
  README records this behaviour at the first import.

Execute Command in a custom n8n image is the alternative. Rejected for the
reasons above. Windmill was compared on the card from the docs (scripts in
git, Bash first class). The user chose n8n and asked (2026-10-18) for a
measured spike of both before the host is built: task group 2 runs one pass
under each, and its table goes to the user whatever it shows: n8n is no
default the table has to beat (user, 2026-10-20). The table also asks how
each engine takes an extension that updates from upstream without a fork and
reaches Claude on the subscription, or an OpenAI-compatible endpoint routing
to a local model.

### `pass.sh` order and exits

1. Validate the clone name: `^[A-Za-z0-9][A-Za-z0-9._-]*$`, not `..`, and a
   git clone under `~/clones`. The guard anchors the whole value (`rules.md`
   Code). On failure: exit 2. No lock, no stop file, because what n8n sent is
   no pass.
2. If `~/orchestrator/<clone>.stop` exists: print
   `orchestrator: paused — <file>: <its first line>; remove it to resume` and
   exit 3. A paused tick reads as failed in n8n's execution list on purpose:
   the loop is waiting on the user.
3. Take the lock: `flock -n -E 75` on `~/orchestrator/locks/<key>.lock`.
   `<key>` is `<owner>-<repo>`, the last two path segments of the clone's
   `origin` URL without `.git`. The HTTPS and SSH forms of one repository
   then share a key. A URL that does not parse that way exits 2, like a bad
   name. Lock held (75): print
   `orchestrator: busy — <lock> is held` and exit 0. A per-clone lock, as the
   card first had it, would let two clones of one repository pick the same
   card at `applying` while the first stage session has no pull request yet.
   One lock per repository leaves concurrency across repositories, which is
   what "one clone per slot" means until slot 2 gives the runner a claim it
   can read. Once the lock is taken, step 2 runs again: a pass that failed
   between the first check and the lock wrote its stop file before letting
   the lock go.
4. Check that the secret files `claude_oauth_token` and `gh_token` exist
   under `/run/secrets` and hold at least one non-whitespace character,
   without loading either value into the wrapper's variables. A file that is
   missing, empty or whitespace-only is a failure: go to step 6 with
   status 1.
5. `trap '' HUP`. Then, in the clone, run
   `env -i PATH=… HOME=… LANG=C.UTF-8 DISABLE_AUTOUPDATER=1 [CLAUDECODE=…] bash -c '…'`.
   Only the child shell reads the two secret files; it exports
   `CLAUDE_CODE_OAUTH_TOKEN` and `GH_TOKEN`, and `exec`s
   `bun node_modules/harness/bun/board-loop.ts`. No token value appears in a
   command's arguments, where `ps` would show it, and the script never turns
   on `set -x`. The wrapper writes the whole output to
   `~/orchestrator/passes/<UTC time>-<clone>.log`, prints it once the pass
   ends and keeps its last line. Not through `tee`: a dropped connection
   would end `tee` on its next write, and the pass with it on its own.
   Ignoring `HUP` keeps an n8n
   restart from killing a stage session halfway. `CLAUDECODE` is passed on
   only when set, so the runner's one refusal still decides. A second copy of
   that check in the wrapper would drift (`rules.md` Code).
6. Non-zero: write the stop file (UTC time, status, last line) and exit with
   the status. The user's decision says "exits 1". The runner itself exits 0
   or 1. Any other status means the pass did not run as designed (127, a
   signal), so the wrapper fails closed on every non-zero status.

Steps 4 and 5 are the wrapper on `main` today. `runner-isolation` groups 1
and 2 replace them before the App key reaches the host. With the App
configured, step 4 neither requires nor opens `gh_token`. In step 5 the board
loop runs from `runner`'s own harness checkout with the push clone as its working
directory, every command in the session's clone goes through
`/opt/orchestrator/as-agent`, and the pass exports no `GH_TOKEN`; only the
push, the `gh pr create`, the check that reads that pull request and
`readPullRequests()` read the PAT file, and with the App configured nothing
does. Its spec's *The wrapper starts the pass with the
environment it names* states the result.

The pass's own record in the gate ledger is unchanged. The wrapper writes no
ledger line. A pass's durable result is on the runner's volume, whatever
happens to the SSH channel: the ledger's `loop` record (outcome, for every
pass), the pass log (its whole output) and, for a non-zero status, the stop
file. The n8n execution is a view of the same pass that an n8n restart can
cut short; nothing reads the outcome from it, so no reconnecting retrieval
step is needed.

### Notion is the hosted MCP server

The pick prompt names `notion-get-comments`. The Notion update guard and the
question gate match `^mcp__.+__notion-update-page$` and
`^mcp__.+__notion-create-comment$` under any server name (`bun/bootstrap.ts`).
Notion's hosted server (`https://mcp.notion.com/mcp`, added at user scope)
exposes those names. The open-source `@notionhq/notion-mcp-server` names its
tools `API-*`: through it a card write would walk past both guards. So the
host README requires the hosted server and has the user confirm the three
names in `/mcp` before the first pass. A server with other names is a new
change, which would widen the matchers. It is never a configuration step.

### Secrets are compose secret files

The secret files are `claude_oauth_token`, `gh_token`, `runner_ssh_pubkey`
and `tunnel_token`. Each sits under `orchestrator/secrets/` on the host and is
mounted at `/run/secrets/`. No secret goes through compose's `${VAR}`
interpolation or an `environment:` literal. An SSH session does not inherit
the container's environment anyway, so `pass.sh` reads the files itself. `gh`
and git's credential helper (`gh auth setup-git`, run in the image) take
`GH_TOKEN`. The n8n SSH key's private half lives only in n8n's credential
store, entered by the user. The App's private key is one more secret file, read by a key-holder user
alone, which mints `runner` an hourly token (`runner-isolation`); it never
enters n8n.

### Workflows go through `export:workflow` / `import:workflow`

n8n's built-in source control is paid. Export with
`n8n export:workflow --backup --output=<dir>`, which writes one pretty file
per workflow. Then delete `meta`, `shared` and `pinData`, and each
credential's `id`. A test refuses those keys, so a careless export fails the
suite rather than shipping an instance id. To deploy:

```text
n8n import:workflow --separate --input=orchestrator/workflows
n8n publish:workflow --id=<id>
```

Then restart n8n, which reads a CLI import only at start. A workflow's
credential is referred to by name (`runner`). If the import does not bind a
name-only credential, the user picks it once in the node. That is measured at
the first import and recorded in the host README.

### Pins and their notes

Every pin is moved by hand, because no Dependabot or Renovate config exists
here. Each `FROM`/`image:` line carries an `@sha256:` digest. Each tool
version (bun as CI's `1.4.2`, `gh`, `claude`, `openspec`, `coderabbit`)
sits in an `ARG` with a full version. Every pin carries a comment, the same on
each line: `# moved by hand — nothing updates this pin`. For n8n's image the
comment adds: re-read n8n's security advisories when moving it. The floor
2.38.2 is a test, so a downgrade fails.

### Clones, not worktrees

Each concurrent slot is a full clone under `~agent/clones/<name>`. The Safety
rule *Push from a repository's own checkout, never a `git worktree`* stands
unchanged. The README's board-loop paragraph says it beside "a clone used for
nothing else".

### Phone access

The n8n UI sits on `hooks.laidrivm.com` through a Cloudflare tunnel
(`cloudflared` in compose). Its execution list shows each pass's output and
each paused tick. In front of it sits Cloudflare Access on the hostname (the
user's email, one-time code), and behind that n8n's own owner login — the
user's decision of 2026-10-18, since n8n has had CVEs that bypassed its own
checks. Access is a dashboard setting, a user act the host README names.
Webhook paths, and the Access bypass they will need for `/webhook/*`, belong
to the webhook step. The second path from the phone is Remote Control, below.

### Remote Control on the host (user, 2026-10-21)

The user reversed one part of the 2026-10-18 decision. Remote Control was
given up then because the claude.ai login on the VPS would expire and need
redoing, not for its reach. The user accepts a login that lasts and that can
be renewed from the phone. What it gives: a Claude Code session on the host
driven from the Claude app, and new sessions started from the app on the
host, which `claude remote-control` (server mode) spawns, up to its
`--capacity` (32 by default).

- **The login.** `claude auth login` once, by the user, in a `tmux` session
  on the host: it prints a URL to open on any device and reads the code back
  from the terminal, so a phone browser and a phone SSH client are enough.
  On Linux the login is the file `~/.claude/.credentials.json`, mode 0600,
  and Claude Code renews it on its own; it warns three days before it expires
  (`Your login expires in 3 days · run /login to renew`). How long it lasts
  is not documented. With Trusted Devices on, the phone side asks again once
  the sign-in is 18 hours old.
- **Two one-time prompts.** In the project directory, `claude remote-control`
  asks to trust the directory and then *Enable Remote Control?*. Neither can
  be answered ahead, and without a terminal the command exits with
  `Workspace not trusted`, so the user answers both in the same `tmux`
  session. The home directory never saves trust, so the server runs in a
  clone's directory.
- **The process.** The server runs inside `tmux`, which the docs name for a
  command that must outlive the SSH session. A systemd unit is not
  documented, so if group 3 wraps the `tmux` session in one, the unit starts
  `tmux` and nothing else. The server exits after about ten minutes without
  a network, so the wrapper restarts it, waiting between attempts so a
  command that exits at once does not spin. It sets no attempt limit, since
  a server that left over a lost network must come back once the network
  does.
- **Beside the unattended passes.** `CLAUDE_CODE_OAUTH_TOKEN`,
  `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN` in a process's environment
  take precedence over the saved login and stop Remote Control. So the
  remote-control process's environment names none of them, and the
  setup-token reaches only the `claude -p` passes, which `pass.sh` starts
  with the environment it names.
  The login and the token sit on one host without one overriding the other.
- **Which user it runs as, and what it reaches.** The login opens the user's
  claude.ai connectors to the host, not only the model. The user that runs
  `claude auth login` is the user that runs the server and the login check,
  since the login is a file in that user's home. That user is `runner`
  (user, 2026-10-21): a phone session reaches the PAT, the Notion bot's token
  and hourly App tokens, never the App key, which a key-holder user alone
  reads. It reaches them exactly as a pass does: the PAT and the Notion
  token by reading their `runner`-owned files, an App token by running
  `/opt/orchestrator/mint` through its sudoers rule, which prints one token
  and stores none. `runner-isolation` fixes the users, every secret file's
  path, owner and mode in the host README, and the reach check that a
  session cannot read them.

## Risks / Trade-offs

- [n8n's SSH node may cut a command that runs past an hour. A pass is a pick
  plus up to an hour of stage.] → `trap '' HUP` keeps the pass alive, and
  the stop file still records its outcome. The spike (task group 2) measures
  it with a 65-minute fake pass before the host is built. If the node cuts
  it, the fallback is a custom n8n image with `openssh-client` and Execute
  Command running `ssh`, weighed in the same table against Windmill.
- [Pro/Max limits are meant for "ordinary, individual usage". Unattended
  volume may be throttled without warning.] → One pass an hour per
  repository. The stop file halts the loop on the first failure.
- [`--max-budget-usd` is a client-side estimate.] → It is not used here. The
  stage session's limit stays the runner's hour.
- [Pushing as the user means a compromised session acts as the user.] → The
  GitHub token is fine-grained to the loop's repositories. The App replaces
  it (`github-app-identity`).
- [`flock` is absent on macOS, so `pass.sh`'s cases skip on the laptop.] →
  CI's `ubuntu-latest` runs them. The skip names that reason, so a skipped
  case is never read as a pass.
- [An agent session in the runner can run `pass.sh` itself.] → Inside a pass
  the lock is held, so it exits busy. From any session, `CLAUDECODE` reaches
  the runner, which refuses. The stop file that follows pauses the loop:
  the safe side.
- [The claude.ai login's lifetime is not documented, and a Remote Control
  session that outlives it stops until the user signs in again.] → A timer
  runs `claude auth status` in the remote-control user's environment, with
  the three token variables cleared so none of them stands in for the
  saved login, and reads the three-day warning, and a failing or expiring login is reported
  to the user. The docs show that warning at startup and do not say whether
  `claude auth status` prints it; task 3.6 records which, and if it does not,
  the check catches the login only once it has failed. Where it reports —
  a card on the board or the engine's own alert — follows the engine group 3
  builds on. The unattended passes run on
  the setup-token, so an expired login stops only Remote Control.

## Migration Plan

Nothing changes for the laptop: the runner is unchanged, and the timer is one
more way to start it. To roll back, stop the stack. The clones keep their
branches, and the board keeps the claimed cards for the next pass from
anywhere.

## Open Questions

The engine: task 2.2 puts the table below to the user. The auth in front of
the n8n UI was settled by the user on 2026-10-18 (*Phone access* above).

## Spike: n8n against Windmill

Task 2.1's secret-free rows, run on the VPS on 2026-10-21, and its token
and Cloudflare rows, run on 2026-10-21 to 22 in a second, short bring-up
(rows 8–12), then on 2026-10-22 control through MCP and a CLI (row 13) and
a re-run of Windmill on its current release, 1.846.1, since the rows above
ran 1.365 (*Windmill 1.846.1* below). The choice of engine goes to the user
(task 2.2).

The host is Ubuntu 24.04.4 (kernel 6.8.0-138), with 2 vCPU, 3.7 GiB RAM and
a 38 GB disk. Docker is `docker.io` 29.1.3 with `docker-compose-v2` 2.40.3,
from Ubuntu's repository. The engines ran were n8n 2.44.4, bumped to 2.45.0
(stock `docker.n8n.io/n8nio/n8n`), and Windmill CE 1.364.3, bumped to
1.365.0 (`ghcr.io/windmill-labs/windmill`: server, one or two workers and
Postgres 16). Each sat beside a copy of `orchestrator/pass.sh` from `main`
in a Debian runner container, reached over SSH with a throwaway key made on
the VPS. The fake runner was a `bun` stub that sleeps. Every secret file
held placeholder text, and every port was bound to 127.0.0.1.

| # | Criterion | n8n | Windmill CE |
|---|---|---|---|
| 1 | A scheduled 65-minute command | **Survives.** Schedule Trigger → SSH node → `pass.sh` ran 00:59:24–02:04:24, `success`, `exit=0`. | **Survives.** Schedule → bash script → `ssh runner pass.sh`, with the script's `timeout: 5400`, ran 01:10:00–02:15:00, `success`. |
| 2 | A second start while the first runs | `N8N_CONCURRENCY_PRODUCTION_LIMIT=1` **queues** it and never refuses. The limit is instance-wide: a webhook sent during the pass waited over 20 s in the same queue, past GitHub's 10 s timeout. | `concurrent_limit: 1` is **ignored**; the worker logs `Concurrent limits are an EE feature only, ignoring constraints`. The schedule skips the ticks that would overlap. With one worker a webhook waited over 20 s behind the pass; a second worker answered in 0.11 s. |
| 3 | A wrong `X-Hub-Signature-256` rejected, a repeated delivery dropped | **Works, in a Code node**: raw-body Webhook → Code (`crypto` HMAC, `timingSafeEqual`, delivery IDs in the workflow's static data) → Respond. A good delivery 202; wrong, missing or tampered 401; a repeat 200, dropped. Needs `NODE_FUNCTION_ALLOW_BUILTIN=crypto` and `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`. The GitHub Trigger node verifies by itself but registers its hook through the API, so it needs a token. | **Works, in a script**, through the script webhook with `raw=true` and the two headers included. Good accepted, wrong or tampered rejected, a repeat dropped. **But** a rejection is HTTP 200 with an error body, since a script webhook cannot set its status, so GitHub's delivery log reads it as delivered. The URL GitHub holds must carry a Windmill token. The HTTP-routes API, which would allow a route without one, answers 404 on this image. |
| 4 | Export, delete, import: runnable, no secret in the files | **Works.** `export:workflow --backup`, delete, `import:workflow --separate`, `publish:workflow --id`, restart: the webhook and the chat answer again. No secret in the files; a credential appears as its id and name. The export carries `staticData`, the delivery IDs, which is state and should be stripped before git. | **Works.** `wmill sync pull`, delete, `wmill sync push`: the scripts come back and run. The secret variable is exported as its encrypted value, which git should not hold: pull with `--skip-secrets`. Schedules are left out unless `--include-schedules`. |
| 5 | An extension beside the stock image calling `claude`; `session_id` and `total_cost_usd` in the execution; survives a bump | **Works, survives.** A ~35-line custom node in the data volume runs a stub `claude -p … --output-format json`; both fields reach the execution record. After the bump the node still loads. | **Works, survives.** No plugin: a bash script runs the stub from a mounted volume, and its JSON is the job's stored result. After the bump it still runs. |
| 6 | What Windmill CE withholds | — | Seen here: concurrency limits, the audit log's content (`EE only`), the HTTP-routes API (404). From the docs, not run: the worker-group UI and git sync from the UI; the CLI sync works in CE. |
| 7 | A phone-usable control surface (user, 2026-10-21) | **Hosted chat works**: a public Chat Trigger page took a typed message, ran the stub and showed the reply with its session id and cost. Run, pause and stop work through the REST calls the UI uses. | An anonymous public app is served without login, but no chat-like app was built. Every script has a run form for a logged-in user. Run, pause and cancel work through REST. |
| 8 | T1: a real `claude -p` stage, started by the engine, on the `setup-token` token in the container | **Works.** The Schedule Trigger at 23:13 started the pass, but the first token file held only a fragment (401 `Invalid bearer token`). After the user rewrote it, a pass at 23:23 ran `claude -p --model haiku --tools ""`: `exit=0`, `result "ok"`, `session_id` and `total_cost_usd` (0.00065) in the SSH node's output, which is the execution record. | **Works.** The schedule fired at 23:32: `exit=0`, `result "ok"`, `session_id` and `total_cost_usd` (0.000037) in the job's logs. A bash script's stored result is its last line only, so the fields sit in the logs, not the result. |
| 9 | T2: `claude -r` across two runs, `~/.claude` on the runner's volume | **Works.** The next pass resumed the same `session_id` and answered the word the first one was given (`lantern`). | **Works.** The same, on a fresh session. |
| 10 | T3: a failed `claude -p`, forced with an invalid token rather than by burning the limit | `exit=1`, `is_error: true`, `401`; `pass.sh` wrote its stop file. **The execution shows Success**, and the overview counts no failed run. | The same: `terminal_reason: "api_error"` in the log, stop file written, **a green check**. |
| 11 | T4: Cloudflare Access from a phone; GitHub's webhook path open, everything else behind the login | **Works.** From outside, `/webhook/github` answered from n8n itself: 202 for a good signature, 401 for a wrong or missing one. `/`, the chat at `/webhook/<id>/chat` and another webhook path answered 302 to the Access login. On the user's phone: the Access login, the n8n UI, the execution list (cut off on the right at phone width) and the chat (`pong: …`) all worked. The user: "могло быть и лучше, но в целом осилить можно". | **Works.** The bypassed job path answered from Windmill itself (`401 Unauthorized`, no token in the URL); `/` and another job path answered 302 to the Access login. On the user's phone: the Windmill login, the Runs list with each job's args and logs, and a run started from the script's form (which finished `exit=0`). The user, against n8n: "как будто получше, да. Но не прям сильно". |
| 12 | T5: load. The harness's whole `bun test` from `main` in the runner, while T1 ran | 2208 pass, 0 fail, 176 s. The host's used memory peaked at 1191 MiB (2628 MiB available at its lowest); n8n at 430 MiB; the runner's CPU at 108 % of 200 %. | 2208 pass, 0 fail, 176 s. The host peaked at 1147 MiB used (2672 MiB available); server 243 MiB, Postgres 113 MiB, two workers under 50 MiB each; the runner's CPU at 113 %. |
| 13 | T6: control through MCP or a CLI, so the user can drive the engine by chatting with a session (user, 2026-10-22). Each call made from the VPS to `https://hooks.laidrivm.com` as a laptop client would, with an Access service token (Service Auth policy) | **MCP works; the CLI cannot run.** The instance MCP at `/mcp-server/http`, enabled by the owner, with its own bearer key: `search_workflows` lists, `execute_workflow` starts a run and returns its id, `get_workflow_execution` gives the status and each node's output (the pass's `spike:` line), and `unpublish_workflow` / `publish_workflow` toggle the whole workflow, its schedule with it; there is no per-trigger toggle. The same server also creates and edits workflows. `@n8n/cli` 0.23.0 (public API key) lists, reads executions and activates or deactivates, but has no command that starts a workflow and no way to add a header, so it cannot pass Access: through the tunnel it fails on the login page. | **MCP and the CLI both work through Access** (1.846.1). MCP at `/api/mcp/w/<workspace>/mcp`, with a token carrying the `mcp:all` scope (without it: `missing mcp scope`): each script is a tool, and a call runs it and returns its last line; `listJobs`, `getJob` and `getJobLogs` give status and logs; `updateSchedule` pauses a schedule with `paused_until`, with no enable switch in MCP. `wmill` 1.846.1 with `HEADERS=CF-Access-Client-Id:…,CF-Access-Client-Secret:…`: `script list`, `script run` streaming the run's log, `job list`, `job get`, `job logs`, `schedule disable` / `enable`. |

With both stacks up, about 1.4 GiB of the 3.7 GiB was in use.

The token bring-up (rows 8–12) ran one engine at a time beside the same
runner: Debian with bun 1.4.2, Claude Code 2.1.307 and `pass.sh` from
`main`, its stage a `bun` script making one `claude -p` call in a throwaway
clone that held nothing else. `cloudflared` 2026.10.3 carried
`hooks.laidrivm.com` to the engine under the alias `engine`. The Claude
token and the tunnel token were root-owned 0600 files on the host, each
copied into a volume only its one container mounted. No App key or PAT was
on the host; `gh_token` held placeholder text. The seven `claude -p` calls,
the user's run from the phone among them, cost about 0.0016 USD in all.

### Windmill 1.846.1

The rows above ran Windmill CE 1.365, a release from July 2024. On
2026-10-22 the same bring-up ran its current release, 1.846.1 (published
2026-10-21), with the same runner, tunnel and Access:

| Row | Windmill CE 1.846.1 |
|---|---|
| 3: a wrong signature, and the token in the URL | **Changed.** HTTP routes now work in CE. A route at `/api/r/github` with `authentication_method: none` runs a script whose preprocessor hands it the raw body and the headers, and the script sets the status with `windmill_status_code`. Through the tunnel: 202 for a good signature, 401 for a wrong one, and no token in the URL. After a script is redeployed, the route ran the previous version until its router refreshed, within a minute. |
| 8: T1 | Works: the schedule fired at 00:11, `exit=0`, `session_id` and `total_cost_usd` in the job's logs. |
| 9: T2 | Works: the same `session_id`, `lantern`. |
| 10: T3 | **Changed by the script, not the engine.** The script now ends on the pass's status, so the run with an invalid token is a failed job: a red ✕ in Runs and in its chart. |
| 11: T4 | Works, and the user found it clearly better than both 1.365 and n8n: "Интерфейс заметно улучшился". Runs, logs, the run form and the paused schedule read well on the phone. |
| 12: T5 | 2221 pass, 0 fail, 179 s. The host peaked at 1245 MiB used (2574 MiB available at its lowest); server 404 MiB, Postgres 300 MiB, workers about 100 MiB each; the runner's CPU at 112 %. The image is 6.1 GB on disk. |
| 13: T6 | In the main table. |

**Decision (user, 2026-10-22): an engine token and the Access service
token may live on the laptop**, so a session there can drive the engine by
chat. It is an exception to keeping every key and token on the host. Two
limits keep it narrow: the engine token carries only the scopes chat
control needs, never one that deploys code, since a deployed script runs
on a worker that reaches the runner; and the Access service token is
allowed by a Service Auth policy on `hooks.laidrivm.com` alone. So the
laptop's token is never the spike's `mcp:all` one, whose tools also create
and update scripts and flows: it is limited to running, reading and
scheduling the pass's own paths. Whether Windmill issues an MCP token that
narrow is unchecked; group 3 checks it, and without one chat control goes
through `wmill` on such a token instead. During the spike both tokens
stayed on the VPS.

What binds group 3 whichever engine is chosen:

1. **`pass.sh`'s `flock` is the real exclusion.** Neither engine refuses a
   second start: n8n queues it and Windmill CE ignores its limit. A second
   pass by hand printed `busy` and exited 0 under both.
2. **An engine's cancel does not stop the pass.** `pass.sh` ignores HUP
   (`trap '' HUP`, *Risks* above), so a cancelled job left the runner's
   process running and the lock held. Group 3 needs a stop path of its own
   on the runner side.
3. **n8n's concurrency limit is instance-wide.** Set at 1, it queues every
   webhook and chat message behind a pass of up to an hour, so it stays
   unset or high, or the pass is started detached and the engine waits on
   nothing.
4. **The host holds one pass.** An engine, a runner, one `claude` session
   and the whole `bun test` ran together under 1.2 GiB used and about one
   of the two vCPUs (row 12). That is one pass at a time, the lock's limit
   anyway; a second slot is unmeasured.
5. **The chat page sits under the webhook path.** n8n serves a Chat
   Trigger at `/webhook/<id>/chat`, so a `/webhook/*` Access bypass
   (*Phone access*) would make the chat a public control surface. The
   bypass names GitHub's webhook paths alone, and row 11 checked that the
   chat stays behind Access.
6. **The engine reports a failed pass as a success.** Row 10: both engines
   marked the run green because the spike's command ended on `echo
   pass_status=$?`. Group 3's command has to end on the pass's own status,
   so a failed pass is a failed execution in the list the phone reads.
   Windmill fails the job on a non-zero exit. n8n's SSH node does not: a
   pass that exited 3 left a successful execution, so n8n needs a node
   after it that fails the run on a non-zero code.

### Recommendation

Windmill CE 1.846.1. Against 1.365 it removed the reasons n8n led on
(2026-10-21): an HTTP route answers 202 or 401 with no token in the URL.
The red failed job is the script's doing, not the release's: the script
now ends on the pass's status, and Windmill fails a job on a non-zero
exit; 1.365 never met one, since its script ended on `echo`. It
now leads where the user looks and where a session drives it:

- on the phone, by the user's judgement (row 11 on 1.846.1);
- through Access from a laptop, where MCP and `wmill` both list, run and
  read status and logs; MCP only pauses a schedule, and `wmill` disables
  and enables one (row 13). n8n's MCP does as much,
  but its CLI cannot start a run or pass Access, and its SSH node leaves a
  failed pass green until a node is added.

What n8n keeps: a ready chat page, lighter containers (n8n peaked at
430 MiB against Windmill's server and Postgres at about 700 MiB, its
workers left out), and a 2 GB image against 6 GB. Under the whole load the
host peaks were close, 1191 MiB used with n8n against 1245 MiB with
Windmill 1.846.1 (row 12), and the host held either with over 2.5 GiB free.
Neither engine's concurrency limit is used: `pass.sh`'s lock does the
excluding, and n8n's limit is instance-wide and stays unset. Windmill's is
still EE-only on 1.846.1, read from the source rather than re-run: CE
stores the setting with HTTP 200 and ignores it, logging only an ERROR line
(`backend/windmill-queue/src/jobs.rs` near line 4893;
https://github.com/windmill-labs/windmill/issues/10840, maintainer-confirmed).
The CE guard that covers schedule and webhook runs alike is a worker tag
served by exactly one worker, so a second run queues rather than overlaps;
`pass.sh`'s `flock` stays the real guarantee.

On 2026-10-21 the recommendation was n8n, for its 401 and its chat page,
against a Windmill 1.365 that answered 200 and held a token in the URL.
