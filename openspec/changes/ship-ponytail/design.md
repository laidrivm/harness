# Design

## Context

- On `origin/main` neither the harness's `.claude/settings.json`, nor
  `bun/sync-settings.ts`, nor anything under `orchestrator/` names a plugin.
  ponytail and you-should-know run only where a person enabled them in their
  own `~/.claude/settings.json`. On the user's laptop that is
  `ponytail@ponytail` and `cc-plugin-you-should-know@builtin`, with the
  marketplace `ponytail` at GitHub `DietrichGebert/ponytail` and
  `autoUpdate: true`.
- `bun/settings.ts` compares the policy values exactly, and
  `bun/sync-settings.ts` writes the same exported constants into a consumer.
  The plugin keys fit that mechanism.
- ponytail 5.3.3, `hooks/ponytail-config.js`, takes its level from the first
  of: `PONYTAIL_DEFAULT_MODE`; the `defaultMode` field of
  `$XDG_CONFIG_HOME/ponytail/config.json`, or of
  `~/.config/ponytail/config.json` (`os.homedir()`) when `XDG_CONFIG_HOME` is
  unset; then `full`. Its SessionStart hook writes the level into a flag
  file, and `ponytail-subagent.js` hands it from there to every subagent.
- The runner starts `claude` as `agent` in two ways. The persistent session
  starts from the entrypoint through `runuser -u agent` without `-l`, which
  sets `HOME` to agent's and keeps the container's environment. The container
  sets no `XDG_CONFIG_HOME`. A pass starts `claude -p` through `as-agent`,
  which sets `HOME=/home/agent` and unsets `XDG_CONFIG_HOME`. `/home/agent` is
  the `agent_home` volume.
- ponytail's `marketplace.json` lists the plugin by the relative source
  `./`. Claude Code docs (plugins/org, *Require plugins per repository*): a
  relative-path plugin loads from the marketplace copy once the repository's
  `extraKnownMarketplaces` applies, and that happens only in a trusted folder,
  `-p` included. On 2.1.316 the probe of 05.11 saw that hold for the first
  start alone (D7).

## Goals / Non-Goals

**Goals:**

- One pinned source for ponytail on the laptop, in consumers and on the VPS.
- ultra for every `claude` that runs as `agent` in the runner container.

**Non-Goals:**

- The level on the laptop and in consumers' clones: it stays each person's.
- Cloud sessions. They do not load plugins from repository settings, so this
  change does not reach them. README says so.
- A plugin of the harness's own (card
  `3f639875c31b8163ba05f9d2da5e7f10`). It can follow this mechanism later.

## Decisions

### D1. The plugins ship through the project's settings

`enabledPlugins` and `extraKnownMarketplaces.ponytail` go into the harness's
`.claude/settings.json`. Sync writes them into consumers (user, 03.11, answer
1 в). The alternatives were a `--plugin-dir` copy in the image, which reaches
only the main session, and `managed-settings.json`, which reaches only the
VPS. Both were dropped with answer 1: the user treats ponytail as part of the
harness everywhere.

### D2. The check: presence for plugins, the whole entry for the marketplace

`bun/settings.ts` exports `PLUGINS`, the two ids, and `MARKETPLACE`, the
`ponytail` entry:

```json
{ "source": { "source": "github", "repo": "DietrichGebert/ponytail", "ref": "v5.3.3" }, "autoUpdate": false }
```

- **Plugins.** The check requires each id in `PLUGINS` to be `true` under
  `enabledPlugins`. A consumer may enable or disable its own plugins beside
  them, so an exact match of the whole object would refuse ordinary use.
  `false` in the tracked file fails the check. One person turns a plugin off
  in `.claude/settings.local.json`: Claude Code lets a `false` there override
  the project's `true`, and the check never reads that file (requirement
  *The permission policy is pinned by a test*).
- **Marketplace.** The check compares `extraKnownMarketplaces.ponytail` with
  `MARKETPLACE` by `Bun.deepEquals`, so key order does not count. Other
  marketplaces are the consumer's own. The entry is compared whole, because
  any field the consumer chose would decide which commit reaches a session.
- **Sync.** `syncSettings` sets each `PLUGINS` id to `true` and the `ponytail`
  entry to `MARKETPLACE`, and keeps every other key of both objects. The
  assignments sit in `settingsText` beside `attribution`. Spreading an array
  or a string would mangle the consumer's own entries without a word. So
  when either key is present and is not a plain object, sync throws naming
  the key, as it does for a `hooks` list that is not a list. Because both
  texts are computed before either is written, neither file changes.
- **The names the settings look up.** `ponytail@ponytail`, the `ponytail`
  key and `cc-plugin-you-should-know@builtin` must match names defined
  outside the repository: ponytail's `marketplace.json` and Claude Code's
  built-in marketplace. A mismatch loads nothing, and the check passes. The
  Code rule on pinning a looked-up name asks for a test that reads the name
  where it is defined. No offline test can read either source: one is on
  GitHub, the other inside the Claude Code binary. Task 4.2 reads them on
  the VPS: `claude plugin list` for ponytail, and `claude plugin details`
  with `/plugin` for the built-in id, which `claude plugin list` omits.
  README names the gap.

### D3. The pin is a tag, and nothing moves it but a hand edit

A `github` marketplace source accepts `repo`, `ref`, `path` and `sparsePaths`.
It has no `sha`, so the pin is the tag `v5.3.3`, at commit
`7801d061243d7b753bad0e0b3c057cd250b11755` when explored on 03.11.
`autoUpdate: false` is written out, although third-party marketplaces
default to `false`, so the pin does not rest on a default.

- The note goes beside `MARKETPLACE` in `bun/settings.ts`: `moved by hand —
  nothing updates this pin`, with the tag's commit. JSON carries no comment,
  so the note sits where the value is defined and sync copies it from
  (Safety rule on pins outside a manifest). A test reads the line before
  `ref` and pins the note.
- Moving the pin means a PR that edits `MARKETPLACE` and the harness's own
  settings file. Consumers take it on their next bump, through sync. Until
  then the VPS has two refs on one copy. `/home/agent/harness` names the new
  tag, a consumer's clone still names the old one, and both share agent's
  single `~/.claude/plugins/marketplaces/ponytail`. A session may therefore
  run the version the other ref named. The gap ends when a consumer's bump
  lands. A bump that fails its checks leaves the old pin, so the gap can
  last longer than a day.
- Probe 1.3 measured nothing (05.11). On the laptop Claude Code updated
  itself from 2.1.316 to 2.1.318 between runs, and under 2.1.318
  `CLAUDE_CONFIG_DIR` did not keep the user's own plugins out, so the run is
  void. The VPS probe (D7) shows only that a first registration honours the
  tag: the copy came up at `v5.3.3`, commit `7801d061…`, and the plugin was
  cached at 5.3.3. Whether a registered copy follows a changed `ref` stays
  unmeasured. So a pin move ends with the read task 4.2 makes: `claude
  plugin list`, as `agent` in `/home/agent/harness`, names the new version.
  Where it does not, run `claude plugin marketplace update ponytail` as
  `agent` and restart `main`. D7's round re-adds the marketplace with the
  pulled ref, but only a repeat at the same ref was probed (`already on
  disk`), so whether a new ref re-clones is unmeasured too.
- An author can move a tag. The commit in the note lets a reader see that
  the tag moved. No test can check it without the network.
- `DISABLE_AUTOUPDATER=1`, which `session.sh` exports, also stops plugin
  auto-update in the main session. A pass's `claude` does not get it, because
  the allowlist in `bun/board-loop-session.ts` drops it. The pass relies on
  `autoUpdate: false` alone. The same export reaches D7's install, which
  needs it for claude itself: the probe's session without it downloaded
  2.1.318 into agent's `~/.local/bin`.

### D4. The level reaches every agent session through a file the entrypoint writes

Before the tmux line, the entrypoint runs one line as `agent`:

```sh
runuser -u agent -- sh -c 'mkdir -p "$HOME/.config/ponytail" && printf "%s\n" "{\"defaultMode\":\"ultra\"}" >"$HOME/.config/ponytail/config.json"' || echo "entrypoint: ponytail's level was not written" >&2
```

- **The main session.** The session and the line both start through
  `runuser -u agent`, so they share agent's `HOME`.
- **The subagents.** They take the level from the plugin's SessionStart flag
  file.
- **The passes.** `as-agent` points `HOME` at `/home/agent` and unsets
  `XDG_CONFIG_HOME`, so `os.homedir()` resolves to the same file (user, 03.11,
  answer 2).
- **Laptop and consumers.** Nothing reaches them: sync writes no level.

The file is written on every start. In 5.3.3 a plain `/ponytail lite`
changes only that project's flag file. `/ponytail default <mode>`
(`ponytail-mode-tracker.js`) rewrites this shared file, and every pass until
the next restart then runs at that level. That is a person's explicit
override on the host, and the next restart returns everything to ultra.

The write runs as `agent`, not root, so a symlink `agent` plants in its
volume can only redirect a write `agent` could make anyway. A failed write
prints a line and the entrypoint goes on. A write that failed under `set -e`
would stop sshd, and its cause lives in the volume: `agent` could make it
unwritable, and the restart policy would loop on it, taking every pass and
webhook down over a style plugin's level. With the line the session runs at
ponytail's default, and task 4.2 checks the level.

The shape `{"defaultMode": "ultra"}` is read from 5.3.3's `getDefaultMode`,
which parses the file and normalises `defaultMode`. The other fields the
plugin reads (`hideStatus`, `quietStartup`) keep their defaults, because the
file is replaced whole.

**Rejected: `PONYTAIL_DEFAULT_MODE`.** To reach a pass, the variable would
have to cross four seams: the sshd forced command, `env -i` in `pass.sh`, the
allowlist in `bun/board-loop-session.ts`, and sudoers `env_keep`. Each is a
list kept short on purpose. The file needs none of them.

**Rejected: writing in `session.sh`.** That script also runs as `agent`, but
the passes do not depend on the session's script: the level must be in place
whether or not `main` ever started. The seam that also kept the line out of
it, `fix/session-continue`, has merged (#418), and D7 now edits the script for
the install, which does depend on the session.

### D5. Trust and the install

- **The VPS main session** runs in `/home/agent/harness`. Like every clone
  `agent` runs claude in, that folder must be trusted once by hand (the
  orchestrator README, step 5, does this for a pass's clone). Until it is,
  the harness's marketplace entry does not apply and the session runs
  without ponytail. Task 3.3 adds the trust step to the host README, and
  task 4.2 checks the result. Once the folder is trusted, the marketplace
  registers into agent's `~/.claude/plugins` on the volume at once, but the
  settings alone do not keep the plugin loaded past that first start (probe,
  05.11): the start script installs it (D7). Probe 1.4's question has its
  answer: no dialog follows the trust dialog, on the VPS and in a clean
  configuration on the laptop, both on 2.1.316, so the pane nobody watches
  waits on nothing.
- **A pass's clone** is trusted already: `bun/board-loop-clone.ts` refuses an
  untrusted one (`not a trusted workspace`). So `extraKnownMarketplaces`
  applies there too, and the clone's own settings enable the plugin. Whether
  the clone loads the copy D7 installs at local scope for
  `/home/agent/harness` is unmeasured: the probe ran in one folder, and a
  local-scope install is recorded against its folder. Where it does not,
  the pass runs without ponytail, as it does before this change, and D4's
  file is written all the same. `CLAUDE_CODE_SYNC_PLUGIN_INSTALL=1` stays
  rejected: it would cross the same four seams as D4's rejected variable.
  Decided (user, 05.11, answer 6 а): nothing changes for the passes now. The
  loop is off in stage 2.5, and task 4.2 reads `claude plugin list` as
  `agent` in a pass's clone before the loop is switched on. A clone that
  does not list the plugin becomes a card of its own, an install in the
  pass. README names the gap.
- **A consumer's fresh clone on the laptop** registers the marketplace when
  its owner accepts the trust dialog. you-should-know sits in the built-in
  marketplace and needs no entry.

### D6. The laptop's entry

On the laptop the user's own `ponytail` entry, with `autoUpdate: true` and no
`ref`, and the project's entry share a name. Since v2.1.228 the
higher-precedence file's entry wins whole, with no field merge. So in the
harness's and consumers' folders the session sees the project's entry: the
tag, and no auto-update. Elsewhere it sees the user's. Both entries name one
registered copy under `~/.claude/plugins/marketplaces/ponytail`. Whether
Claude Code re-fetches that copy when the effective source changes between
folders is unverified (task 1.2).

Decided (user, 03.11, answer 4 а): the user's own entry stays as it is. The
pin applies in the harness's and consumers' folders, and the user's
auto-update applies everywhere else. If task 1.2 shows the copy changing
version between folders, the user switches to option б: their own entry
takes the same `ref` and `autoUpdate: false`, and they move it by hand
whenever the harness moves the tag.

Unverified (05.11): tasks 1.1 and 1.2 were not run, and 1.3 and 1.4 on the
laptop are void (D3). D6 rests on the documentation alone until 1.2 runs,
and option б stays the fallback. One laptop run did count: in a clean
configuration on 2.1.316 the trust dialog was followed by no screen and
nothing was installed. So a laptop that never had ponytail needs the one
install README names. The user's own laptop has it already, at user scope.

### D7. The runner installs ponytail before each start

Decided (user, 05.11, «а»): on 2.1.316 the project's settings alone do not
install ponytail reliably, so the runner installs it explicitly, as `agent`
in `/home/agent/harness`. The project's settings stay as task 2.4 writes them.
The call first shipped as `claude plugin install ponytail@ponytail --scope
project` alone; the VPS on 06.11 replaced it with two calls at local scope
(below, task 3.5).

The probe that decided it (VPS, as `agent`, 2.1.316, nothing of ponytail
installed beforehand, a scratch folder holding exactly task 2.4's settings):

- The first trusted start showed no screen after the trust dialog. The
  marketplace registered at once at `v5.3.3` (`7801d061…`) and the plugin was
  cached at 5.3.3. It loaded into that session, its band and skill listed,
  but its SessionStart hook did not run there: no `PONYTAIL MODE ACTIVE`,
  band `off`. `installed_plugins.json` kept `.plugins` empty, and `claude
  plugin list` named none.
- The second start did not load it. `/plugin` → Errors: `Plugin "ponytail"
  not cached at /home/agent/.claude/plugins/marketplaces/ponytail — Run
  /plugin to refresh`. The marketplace's manifest has `"source": "./"`.
- `claude plugin install ponytail@ponytail --scope project` in that folder
  succeeded and warned `4 userConfig options not yet set` (*Risks*).
  `installed_plugins.json` listed the plugin. On the next start the band read
  `full`, and ponytail's mode file appeared under `~/.claude/ponytail-modes/`.

What the image built from `330f3e76` showed (VPS, as `agent` in
`/home/agent/harness`, 2.1.316, 06.11):

- **A fresh home's install fails at once.** With no ponytail in
  `known_marketplaces.json`, `claude plugin install ponytail@ponytail` exits
  1: `Plugin "ponytail" not found in marketplace "ponytail"`. The project's
  `extraKnownMarketplaces` reaches `known_marketplaces.json` only once
  `claude` itself starts, after the round's install has run. So the install
  succeeds from the second round on at best, and the pane never shows why
  the first failed: claude's screen draws over the line.
- **Project scope dirties the clone.** A successful `--scope project` install
  rewrites the tracked `.claude/settings.json` in Claude Code's own layout,
  two spaces for tabs and its own key order, with the same content. `git
  status` shows it modified, and the next pull that touches the file fails.
  This is the dirty clone answer 5 а named (user, 05.11): the call switches
  to `--scope local`.
- **`claude plugin marketplace remove ponytail` in the clone strips the
  project's entries.** Run there, it rewrote the tracked
  `.claude/settings.json` without `extraKnownMarketplaces.ponytail` and
  without `ponytail@ponytail` in `enabledPlugins`. Nothing in the harness
  runs it; a person removing the marketplace by hand runs it from another
  folder.
- **The two calls at local scope.** `claude plugin marketplace add
  DietrichGebert/ponytail#v5.3.3 --scope local` cloned the tag at
  `7801d061…`, registered it in `known_marketplaces.json` with that ref, and
  wrote the entry into the clone's `.claude/settings.local.json`, which
  `.gitignore` names. `claude plugin install ponytail@ponytail --scope local`
  then installed 5.3.3 and wrote `enabledPlugins` there. `git status` stayed
  clean, agent's `~/.claude/settings.json` was untouched, and `claude plugin
  list` showed `ponytail@ponytail`, 5.3.3, scope local, enabled. A second run
  of both exited 0: `already on disk` and `already installed`.

The calls go in `session.sh`, in the round that finds the clone, after
`bun install` and before `claude`:

```sh
mkdir -p "$HOME/.cache"
{
	date -u "+%Y-%m-%dT%H:%M:%SZ ponytail's install"
	src=$(bun -e 'const s = (await Bun.file(".claude/settings.json").json()).extraKnownMarketplaces.ponytail.source; console.log(`${s.repo}#${s.ref}`)') &&
		timeout --foreground 120 claude plugin marketplace add "$src" --scope local &&
		timeout --foreground 120 claude plugin install ponytail@ponytail --scope local
} >>"$HOME/.cache/session-start.log" 2>&1 || echo "session: ponytail's install failed; starting claude anyway" >&2
```

- **Not before the clone or the login.** The round runs the calls only
  where `$HOME/harness/.git` exists. With the marketplace added by the round
  itself, the install no longer waits for a start to register it. Whether
  the calls need the folder trusted is unmeasured: the probe's clone was
  trusted. README step 12 still has the user trust the folder and `/exit`
  once. The entrypoint, the other place weighed, runs once per container
  start: on a fresh volume that is before anyone logged in, and it would not
  try again until the next restart.
- **The network.** Both calls reach GitHub. Like the pull and `bun install`,
  a failure prints its line and the session starts on what the volume
  holds. coreutils' `timeout`, which the forced command's notice already
  uses in the image, ends a call that hangs after 120 s, and its exit takes
  the same line. `--foreground` keeps each call in the pane's foreground
  process group: without it a call that touches the tty would be stopped and
  sit out the whole limit every round. A failed add skips the install,
  which would find no marketplace either.
- **The log.** Each round appends a UTC timestamp line and both calls'
  output to `~/.cache/session-start.log`, so a failure can be read after
  claude's screen has covered the pane. The pane keeps only the one line.
  Nothing rotates the log: a few short lines per round, and a round is
  rare.
- **Idempotent.** The calls run every round. Probed on 06.11: a repeat of
  both over an installed plugin exits 0 and changes nothing. Whether a
  repeat reaches the network stays unmeasured. A round is rare, once per
  exit of `claude`.
- **Pinned.** The round reads the source and tag from
  `extraKnownMarketplaces.ponytail` in the clone's `.claude/settings.json`,
  which the round's pull has just brought up to date, with bun, which the
  image already runs. The script is baked into the image at
  `/opt/orchestrator/session.sh`, so a literal there would keep the old tag
  after a pin move until the next rebuild. Settings without the entry fail
  the read, and the round prints the install's line.
  `orchestrator/session.test.ts` runs the read over the harness's own
  settings and expects the add built from `MARKETPLACE`.
  `DISABLE_AUTOUPDATER=1`, exported at the top of the script, keeps claude
  itself at the image's version (D3).
- **The shell.** A redirection that fails on a compound command may end a
  POSIX shell. dash, the image's `/bin/sh`, skips the group and goes on,
  and the test pins that under `sh` and `dash` with `~/.cache` a file.
- **The limit.** Each call has its own 120 s limit, so a slow network can
  hold a round for up to 240 s; a hung add skips the install, so a dead
  one holds it for 120 s.
- **Local scope.** Both calls write only the clone's untracked
  `.claude/settings.local.json` and agent's files under `~/.claude/plugins/`,
  so the clone stays clean for the next pull. A pass's clone does not read
  that file; whether a pass loads ponytail stays task 4.2's read (D5).
- **D4's level file stays in the entrypoint.** The passes read it whether or
  not `main` runs, and it needs neither the network nor the trust.

## Risks / Trade-offs

- [A moved tag] → the note records the commit. A reader sees the drift on
  the next bump of the pin. Nothing detects it sooner.
- [you-should-know is renamed or removed from a Claude Code build] → the
  check still passes, since it reads settings, not the installed set. What
  Claude Code does with a missing `@builtin` id is unverified: task 1.1 was
  not run (05.11). README names the plugin's costs and that it is
  undocumented.
- [A pass's clone does not load the copy installed for `/home/agent/harness`]
  → the pass runs without ponytail, as before. Task 4.2 reads it before the
  loop is switched on, and a miss becomes a card of its own (D5, answer 6 а).
- [The laptop's copy is re-fetched between folders] → task 1.2 was not run
  (05.11), so the settings land without it. The fallback is D6's option б.
- [The install leaves the four `userConfig` options unset on the VPS] → the
  install warns about `ledger`, `webhookUrl`, `webhookToken` and
  `sendNames`. Nothing needs them: ponytail 5.3.3's band
  (`hooks/band/register.tsx`) writes the ledger unless `ledger` is `false`,
  posts nothing without a `webhookUrl`, and reads the token and the names
  only for a webhook. Unset, they act as their defaults, and nothing leaves
  the host.
- [`--scope project` rewrites the tracked settings in the clone] → seen on
  06.11, so the calls run at `--scope local`, which leaves the tracked tree
  clean (D7, answer 5 а). Task 4.2 still reads `git status`.
- [The start log grows on the volume with nothing rotating it] → a few
  short lines per round, and a round is rare (D7).
- [A network that hangs holds the session's start] → the install runs under
  a 120 s `timeout` (D7).
- [Plugin hooks run in every consumer session] → ponytail's ledger
  (`userConfig.ledger`, default `true`) writes a line per turn under
  `~/.config/ponytail/band/`. The file stays local, and its webhook is
  empty. README names it.
- [The ledger grows on the VPS's volume with nothing rotating it] → about
  one short CSV row per turn, tens of megabytes a year at the loop's
  rate. Accepted until the volume's size is seen to matter. Turning
  `userConfig.ledger` off on the host is then one `claude plugin configure`
  as `agent`.
- [A pin move leaves the VPS's clones on two refs for a bump] → D3.

## Migration Plan

1. Merge, and the harness's own settings carry the keys at once.
2. Consumers take them on their next daily bump: sync writes them, and the
   check passes.
3. The VPS takes the entrypoint line and the start script's install at the
   next image build and start (host-deploy, or by hand until it lands), then
   README step 12's trust and `/exit`.
4. Rollback: revert the PR. A consumer's next bump removes nothing, because
   sync keeps keys it does not own, so a revert leaves the two entries in
   consumers until they are removed by hand. README says so.

## Seams

Refreshed 05.11: #413, #418, #421 and #423 have merged.

- **#418 (`fix/session-continue`)** rewrote `orchestrator/runner/session.sh`
  to continue the last conversation. This change edits that script on top of
  it (D7), the install's lines in the round that finds the clone, and its
  test's stub. Task 3.5's fix (06.11, `fix/ponytail-install-at-start`)
  replaced the one line with the block D7 shows, on `main` after
  `dbf00ef8`. claude's stub now prints a line per plugin call, which the
  start log's case reads, and bun's runs the real bun for the settings'
  read.
- **#413 (`fix/runner-image-bun-modes`)** edited the Dockerfile's copy of
  `bun/` and README step 12's numbered items. This change edits neither: it
  adds two sentences to the end of step 12's first paragraph as #418 left it.
- **#412 and #421** put the session's rules at `/etc/claude-code/CLAUDE.md`
  and that directory at 0755. **host-deploy**, still open, owns
  `managed-settings.json` there. This change writes nothing under
  `/etc/claude-code/`.
- **#423 (`feat/session-wrapup-on-done`)** added `Skill(session-wrapup)` to
  the allow list of `.claude/settings.json`. This change adds two top-level
  keys at the end of the file and leaves the allow list alone.
- **The entrypoint's tmux line** is pinned by the test of the requirement
  *the-container-restarts*. The new line goes before it and leaves it
  unedited.
