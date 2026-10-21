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
enters the agent's sandbox. That key is not n8n's: under `github-app-identity`
the runner itself reads it from a file and mints the push token after the
session ends, and the user decided (ghapp card, 2026-10-18) that it lives on
the VPS in a file only the runner's Unix user reads, with sessions run as a
different user. n8n's credential store holds only the SSH key that reaches
the runner. An agent session inside n8n's container, as the explore sketched
with Execute Command in a custom n8n image, would still read that store (same
uid, `/home/node/.n8n`) and inherit n8n's environment, `N8N_ENCRYPTION_KEY`
included. So:

- n8n runs the stock image. Execute Command stays disabled, as n8n 2.x ships
  it.
- A `runner` service, built from `runner/Dockerfile`, holds git, `gh`, bun,
  `claude`, `openspec`, `coderabbit`, `flock` and `sshd`. It holds two users.
  `runner` runs `pass.sh` and `board-loop.ts` and alone reads the secret
  files. Compose mounts file-backed secrets as bind mounts and applies no
  `uid`, `gid` or `mode` to them, so the files keep their host ownership: the
  image gives `runner` a fixed numeric uid, and the host README has the user
  make each file under `orchestrator/secrets` owned by that uid with mode
  0400 and the directory 0500. `/run/secrets` stays traversable; what keeps
  `agent` out is the files' owner and mode. `agent` runs the pick and
  stage sessions: `board-loop.ts` starts `claude` as `agent` through one fixed
  `setpriv` (or `sudo -u agent` with a single-command rule) with the
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
store, entered by the user. Once `github-app-identity`'s second step lands,
the App's private key joins them as one more secret file read by `runner`
alone, named by `HARNESS_GITHUB_APP_KEY`; it never enters n8n.

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
  claude.ai connectors to the host, not only the model. One fixed point: the
  user that runs `claude auth login` is the user that runs the server and
  the login check, since the login is a file in that user's home. Which
  Unix user that is, which clones and files it can read, and whether the
  App key or a token is in its reach are the card *Keep the runner from
  running code a session can write while the App key or a token is in
  reach* to settle; this change does not decide them, and group 3 builds the
  server only once that card has.

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
  runs `claude auth status` in the remote-control user's environment and
  reads the three-day warning, and a failing or expiring login is reported
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

None. The auth in front of the n8n UI was settled by the user on
2026-10-18 (*Phone access* above).
