# The orchestrator host

The board loop on its own VPS: Windmill runs one pass an hour, over SSH, in a
runner container that holds the clones (`openspec/changes/vps-board-loop/`).
Every step below is the user's, by hand. Placeholders in angle brackets stand
for the host's own values; this file names no address and no account.

## Host requirements

- A Linux VPS with Docker and the compose plugin, at least 2 vCPU, 3.5 GiB
  of RAM and 20 GB of free disk (the runner image is about 6 GB).
- SSH as root by key only.
- A Cloudflare zone for the hostname Windmill's UI sits on.
- This repository checked out on the host, as root, for `compose.yaml`.

## 1. The tunnel and Access

In Cloudflare Zero Trust, create a tunnel whose public hostname routes to
`http://engine:8080`, and an Access application on that hostname with an
email login. Add one more Access application, with a Bypass policy, on the
path `/api/r/github` alone, which GitHub's webhook calls. Keep the tunnel's
token for step 3.

## 2. The token

On the laptop, run `claude setup-token` and keep the token it prints.

The host holds no GitHub token of the user's. It pushes, opens and reads pull
requests as the GitHub App alone, whose key and key-holder user arrive with
`runner-isolation`'s group 5 (task 5.5). Until then a pass refuses at its
secret check, naming the missing file, and pauses the clone; the schedule
stays disabled until then anyway (step 6).

## 3. The secret files

On the host, as root, in `orchestrator/`. Each command on its own line; the
`cat` ones read the value from the terminal, ended with Ctrl-D, so it lands in
no shell history.

```sh
umask 077
mkdir secrets
cd secrets
cat > claude_oauth_token
cat > tunnel_token
openssl rand -hex 32 > db_password
printf 'postgres://postgres:%s@db:5432/windmill?sslmode=disable\n' "$(cat db_password)" > database_url
ssh-keygen -t ed25519 -N '' -C engine -f engine_key
mv engine_key.pub runner_ssh_pubkey
ssh-keygen -t ed25519 -N '' -C runner -f runner_host_key
printf 'runner %s\n' "$(cut -d ' ' -f 1,2 runner_host_key.pub)" > runner_known_hosts
rm runner_host_key.pub
openssl rand -hex 32 > github_webhook_secret
ssh-keygen -t ed25519 -N '' -C event -f event_key
mv event_key.pub runner_event_pubkey
```

`engine_key` is the engine's private key for the pass, `event_key` its key for
webhooks: both go into Windmill in step 4 and are then deleted. `db_password`
is 64 hex characters, since a raw `@`, `:` or `/` in the URL's password would
read as URL syntax. `github_webhook_secret` is the secret each repository's
webhook signs with (step 10).

Then the owners and modes. Every file is owned by `runner`'s uid, which the
runner's Dockerfile fixes, except `tunnel_token`, which `cloudflared` reads as
uid 65532, and `engine_key` and `event_key`, which stay root's until step 4
deletes them:

```sh
chown 1500:1500 claude_oauth_token runner_ssh_pubkey runner_host_key runner_known_hosts db_password database_url
chown 1500:1500 github_webhook_secret runner_event_pubkey
chown 65532:65532 tunnel_token
chmod 0400 *
cd ..
chown 1500:1500 secrets
chmod 0500 secrets
```

The App's key and its owner arrive with `runner-isolation`; it never sits in
this directory's list above.

## 4. The stack and the engine

```sh
docker compose up -d --build
```

The runner refuses to start without `runner_ssh_pubkey`, `runner_host_key` or
`runner_event_pubkey`. Open the hostname from step 1, pass Access, and set
Windmill's admin login. In the workspace, create the secret variable
`f/orchestrator/runner_ssh_key` and paste `engine_key` base64-encoded on one
line, the output of `base64 -w 0 secrets/engine_key`. Then
`rm secrets/engine_key`. Do the same for `f/orchestrator/runner_event_key`
with `base64 -w 0 secrets/event_key`, then `rm secrets/event_key`.

## 5. The clones

As `agent`, the user the sessions run as, one clone per repository under
`/home/agent/clones/`, never a worktree:

```sh
docker compose exec -u agent runner git clone <repository URL> /home/agent/clones/<clone>
docker compose exec -u agent -w /home/agent/clones/<clone> runner git config core.hooksPath <the repository's hooks directory>
docker compose exec -u agent -w /home/agent/clones/<clone> runner bun install
docker compose exec -u agent -w /home/agent/clones/<clone> -it runner claude
```

In that session accept the trust dialog, then add Notion's hosted MCP server
at user scope and authenticate it:

```sh
claude mcp add --transport http --scope user notion https://mcp.notion.com/mcp
```

Run `/mcp` and confirm the server lists `notion-get-comments`,
`notion-update-page` and `notion-create-comment`. A server that names its
tools otherwise, such as the open-source `@notionhq/notion-mcp-server`, lets a
card write walk past the guards: do not run the loop on it. `/exit`, then
authenticate the CodeRabbit CLI:

```sh
docker compose exec -u agent -it runner coderabbit auth login
```

## 6. The workspace

From the laptop, with `wmill` pointed at the hostname and an Access service
token in `HEADERS` (step 9), push the scripts, the hourly schedule and the
webhook's route:

```sh
wmill sync push --skip-secrets --include-schedules --include-triggers
```

The pass script sends the clone `harness` and its repository; another clone
needs its own script. The schedule is pushed disabled: leave it so until
`runner-isolation` adds the launcher that runs the sessions as `agent` (its
group 5), then enable it in Windmill.

## 7. A paused loop and a stopped pass

A failed pass writes `/home/runner/orchestrator/<clone>.stop` with the time,
the exit status and the pass's last line, and every later tick of that clone
fails in Runs with the paused line. Before removing the stop file, read it and
the pass's whole output, `/home/runner/orchestrator/passes/<time>-<clone>.log`:

```sh
docker compose exec -u runner runner cat /home/runner/orchestrator/<clone>.stop
docker compose exec -u runner runner ls /home/runner/orchestrator/passes
docker compose exec -u runner runner cat /home/runner/orchestrator/passes/<time>-<clone>.log
docker compose exec -u runner runner rm /home/runner/orchestrator/<clone>.stop
```

Cancelling a job in Windmill does not stop a pass. To stop one, run this,
from a host shell or the emergency session, and never a `kill` on the host:

```sh
docker compose exec -u runner runner /opt/orchestrator/stop.sh <clone>
```

It prints `idle` when no pass runs. Otherwise it writes the stop file with
`stopped by hand`, ends the pass and waits for its lock, so the loop stays
paused until the file is removed.

## 8. The emergency session

For an intervention from the phone: ssh to the host as root, run
`claude auth login` once (its URL opens on any device), then start `claude`
with Remote Control in the harness checkout, and end the session when done.
Nothing keeps it running. Its login is `/root/.claude/.credentials.json`; when
it has expired, run `claude auth login` again. Root's shell exports none of
`CLAUDE_CODE_OAUTH_TOKEN`, `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN`,
since any of them would replace the login and stop Remote Control. While it
runs, the session reaches every secret on the host.

## 9. The laptop clients

Chat control from the laptop uses two tokens, neither of which can change the
engine's code:

- an Access service token, with a Service Auth policy on the hostname, which
  `wmill` sends in `HEADERS`;
- a Windmill token limited to running, reading and scheduling the pass's own
  paths, never `mcp:all`, for MCP. Whether Windmill issues an MCP token that
  narrow is checked at the first bring-up; without one, chat control goes
  through `wmill` alone.

## 10. The CI flow's webhook

`ci-run-agent`'s flow: a failed CI run on one of the loop's pull requests
starts an agent that fixes it or says why it cannot. Its acts, in order:

1. The webhook secret is `secrets/github_webhook_secret`, made in step 3.
2. Give the GitHub App the repository permission *Actions: read-only*, and
   accept it on each installation: reading a run and its logs needs it.
3. On each repository the loop serves, add a webhook: payload URL
   `https://<hostname>/api/r/github`, content type `application/json`, the
   secret printed by `cat secrets/github_webhook_secret` on the host as root,
   and the *Workflow runs* event alone.
4. The Access bypass on `/api/r/github` is step 1's; nothing else is open.

GitHub sends a `ping` when the webhook is created. In Windmill's Runs it is a
job of `f/orchestrator/event` whose log reads
`event: ignored — no flow takes ping`. A failed job there names why instead: a
refused signature means the webhook's secret differs from the file. The route
answers GitHub before the handler runs, so *Recent deliveries* reads every
delivery as delivered; Runs is where a refusal shows. To stop the flow,
disable the webhook on GitHub.
