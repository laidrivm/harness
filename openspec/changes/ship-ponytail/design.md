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
  `-p` included.

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
  last longer than a day. Probe 1.3 shows whether the copy follows `ref` at all, and the pin
  move's procedure is written after it.
- An author can move a tag. The commit in the note lets a reader see that
  the tag moved. No test can check it without the network.
- `DISABLE_AUTOUPDATER=1`, which `session.sh` exports, also stops plugin
  auto-update in the main session. A pass's `claude` does not get it, because
  the allowlist in `bun/board-loop-session.ts` drops it. The pass relies on
  `autoUpdate: false` alone.

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
the `fix/session-continue` PR edits it now (see *Seams*), and the passes do
not depend on the session's script.

### D5. Trust and the install

- **The VPS main session** runs in `/home/agent/harness`. Like every clone
  `agent` runs claude in, that folder must be trusted once by hand (the
  orchestrator README, step 5, does this for a pass's clone). Until it is,
  the harness's marketplace entry does not apply and the session runs
  without ponytail. Task 3.3 adds the trust step to the host README, and
  task 4.2 checks the result. Once the folder is trusted, the marketplace
  registers into agent's `~/.claude/plugins` on the volume, and the
  relative-path plugin loads from that copy. Whether that first start shows
  an install or `userConfig` dialog in the pane nobody watches is unverified.
  Probe 1.4 checks it before the image change lands.
- **A pass's clone** is trusted already: `bun/board-loop-clone.ts` refuses an
  untrusted one (`not a trusted workspace`). So `extraKnownMarketplaces`
  applies there too. In `-p` the install runs in the background. A pass that
  runs before the marketplace was ever cloned can miss ponytail on its first
  turn. `CLAUDE_CODE_SYNC_PLUGIN_INSTALL=1` would close that gap, but it
  would cross the same four seams as D4's rejected variable. Nothing orders
  the main session's first registration before a pass: `tmux new-session -d`
  returns at once. Several passes starting the first install together could
  race on one copy. The loop is off in stage 2.5, and task 4.2 confirms the
  registration through the main session before the loop is switched on.
  Once the copy exists, no pass installs it again. The gap is accepted and
  named in README.
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

## Risks / Trade-offs

- [A moved tag] → the note records the commit. A reader sees the drift on
  the next bump of the pin. Nothing detects it sooner.
- [you-should-know is renamed or removed from a Claude Code build] → the
  check still passes, since it reads settings, not the installed set. What
  Claude Code does with a missing `@builtin` id is unverified (task 1.1).
  README names the plugin's costs and that it is undocumented.
- [A pass misses ponytail on its first turn before the first registration]
  → accepted, D5.
- [The laptop's copy is re-fetched between folders] → task 1.2 checks it
  before the settings land. The fallback is D6's option б.
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
3. The VPS takes the entrypoint line at the next image build and start
   (host-deploy, or by hand until it lands).
4. Rollback: revert the PR. A consumer's next bump removes nothing, because
   sync keeps keys it does not own, so a revert leaves the two entries in
   consumers until they are removed by hand. README says so.

## Seams

- **`fix/session-continue`** edits `orchestrator/runner/session.sh`. This
  change leaves that file alone (D4).
- **`fix/runner-image-bun-modes`** edits the Dockerfile's `COPY --from=bun`
  line and README step 12. This change edits neither the Dockerfile nor that
  step.
- **The session-rules PR** adds `orchestrator/runner/CLAUDE.md` →
  `/etc/claude-code/`. **host-deploy** owns `managed-settings.json` there.
  This change writes nothing under `/etc/claude-code/`.
- **`spec/session-wrapup-on-done`** adds `Skill(session-wrapup)` to the allow
  list of `.claude/settings.json`. This change adds two top-level keys at the
  end of the file and leaves the allow list alone. A conflict on merge is
  textual at most.
- **The entrypoint's tmux line** is pinned by the test of the requirement
  *the-container-restarts*. The new line goes before it and leaves it
  unedited.
