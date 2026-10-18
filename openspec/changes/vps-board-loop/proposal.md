# vps-board-loop

## Why

The board loop moves work across the board only while the user sits at a
terminal and starts each pass by hand. The user decided to run the agent
orchestrator on a VPS of its own under n8n, and this is its first slice: the
pass the harness already has, started every hour by a timer on that host, with
nobody at a terminal. Webhooks and every later flow build on that host.

## What Changes

- A new top-level `orchestrator/` directory in this repository holds what the
  host runs, and no secret. Every sensitive value comes from an untracked file
  on the host:
  - a compose file with three services: n8n, a runner container where the
    pass runs, and `cloudflared` for `hooks.laidrivm.com`;
  - the runner's `Dockerfile`;
  - the n8n workflow, exported as JSON;
  - `pass.sh`, the wrapper the timer runs;
  - a host README.
- n8n starts the pass hourly over SSH in the runner container. The runner's
  key allows only `pass.sh`. n8n's Execute Command node stays disabled, and
  the agent never shares a container with n8n's credential store.
- `pass.sh` takes a lock with `flock -n`, keyed by the clone's repository, so
  one pass runs per repository at a time and a second tick finds the lock held.
  A pass that exits non-zero leaves a stop file, and the timer starts no pass
  until the user removes that file by hand.
- The README and the runner's header say a timer the user set up on a host of
  their own may start the pass. A `board-loop` requirement says so too. The
  refusal inside a Claude Code session (`CLAUDECODE`) stays, and `pass.sh`
  hands that variable on so the runner still sees it.
- Concurrent passes get one full clone each, never a worktree. The Safety rule
  on pushing from a worktree is unchanged.
- Host requirements written down: the trust dialog once per clone, Claude on
  the host through `claude setup-token`, Notion as a configured MCP server,
  `gh` through a token file, a persistent home volume, `core.hooksPath` per
  clone.

## Non-goals

- Webhooks, the router and the CodeRabbit flow. They come in a later step, on
  this host.
- `--session-id` in the loop's record and the PR → session table (slot 2).
- A dashboard or status page. For now the n8n UI's execution list is the view
  from the phone.
- The GitHub App. Its sibling proposal `github-app-identity` comes after this
  one. Until the App lands, the loop pushes as the user, as it does from the
  laptop.
- Windmill. It was considered and not taken, unless the host shows n8n cannot
  run a pass (design.md).
- Anything an agent would do on the VPS. No agent logs in there. The host's
  address appears in no file.

## User acts

Only the user does these, by hand, on the VPS or in a dashboard. The host
README lists them in order:

1. Create the Cloudflare tunnel for `hooks.laidrivm.com` and a Cloudflare
   Access application on it (email, one-time code) in front of the n8n UI,
   then put the tunnel token in the host's secrets directory.
2. Run `claude setup-token` on the laptop, and save the token in the host's
   secrets directory. Save a fine-grained GitHub token there too, scoped to the
   repositories the loop pushes to.
3. Build and start the stack, create the n8n owner account, and give n8n the
   runner's SSH key as a credential.
4. In the runner, clone each repository into its own directory, set
   `core.hooksPath`, and run `bun install`. Run `claude` there once, accept
   the trust dialog and `/exit`. Add and authenticate the Notion MCP server,
   and authenticate the `coderabbit` CLI.
5. Import the workflow, publish it, and restart n8n.
6. When a pass pauses the loop, read the stop file and the pass's output, then
   remove the stop file.

## Capabilities

### New Capabilities

- `orchestrator`: the host that starts unattended agent runs. In this change
  that means the timer's wrapper (one pass per repository, the stop file, the
  environment it passes on) and what the tracked `orchestrator/` directory may
  hold (no secret, exact pins, each naming what moves it). Later flows add
  their requirements here.

### Modified Capabilities

- `board-loop`: gains *A timer the user set up may start the runner*. The
  requirement *The runner is the user's script and starts from a clean clone*
  is unchanged, so the delta copies nothing from the live spec.

## Impact

- New: `orchestrator/`. Consumers install the package whole, so the directory
  lands, inert, under their `node_modules/harness/`. `sync.ts` copies only
  `core/*.md`, so no consumer has to ignore it. `check.ts` places root files
  alone, so a new directory needs no `rootFiles` entry.
- `.gitignore` gains the host's secrets directory.
- `README.md` (Layout, and the board loop's paragraph) and the header comment
  of `bun/board-loop.ts`. The runner's code is unchanged.
- `openspec/specs/board-loop/spec.md` and a new
  `openspec/specs/orchestrator/spec.md`, through this change's deltas.
- Tests: `orchestrator/*.test.ts`, collected by `bun test`, and one case in
  `bun/board-loop-clone.test.ts`. `pass.sh`'s cases need `flock`, which macOS
  lacks, so they run in CI and on Linux.
