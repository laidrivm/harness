# Tasks

The change is one pull request, well within the 800-line diff budget. Group 1
runs before any code, every probe in a scratch setup. Its results go into design.md, and a result that
contradicts D5 or D6 stops the apply for the user. The command guard refuses
an agent's call that redirects Claude Code's configuration (seen 03.11 on
`XDG_CONFIG_HOME`), so each probe names who runs it.

## 1. Probes (Claude Code 2.1.316)

Run 05.11 by the user (design.md D3, D5, D6, D7). On the laptop Claude Code
updated itself from 2.1.316 to 2.1.318 between runs, and under 2.1.318
`CLAUDE_CONFIG_DIR` did not keep the user's own plugins out, so 1.3 and 1.4
there are void. The VPS probe, as `agent` on 2.1.316, stood in for 1.4 and
led to D7. Each box below is ticked as done, with what it measured.

- [x] 1.1 Not run: what a missing `@builtin` id does stays unverified
      (design.md, *Risks*). A plugin id under `builtin` that no build ships. In a scratch
      directory, give `.claude/settings.json` the entry
      `"no-such-plugin@builtin": true`. In a throwaway `CLAUDE_CONFIG_DIR`
      (the user, in a terminal of their own), run `claude plugin details
      no-such-plugin@builtin` there, then start `claude` there and open
      `/plugin`. `claude plugin list` omits built-in plugins, so it cannot
      show this. Record in design.md, *Risks*, whether it errors, warns or says
      nothing, and whether a session still starts
- [x] 1.2 Not run: D6 is unverified, and option б stays its fallback.
      The laptop's entry (D6, answer 4 а). With the user's own
      configuration, start `claude` once in a harness worktree that carries
      the new settings, then once in a folder outside it. After each, read
      the `HEAD` of `~/.claude/plugins/marketplaces/ponytail` and the
      installed version under `~/.claude/plugins/cache/ponytail/ponytail/`
      (the user, in a terminal of their own). Compare both with the pin:
      after the harness start, the copy's `HEAD` must be the commit of tag
      `v5.3.3` (design.md, D3) and the installed version must be 5.3.3.
      Record both reads. A copy that changes between folders, or a harness
      start that reads anything but the pin, means telling the user to
      switch to D6's option б before the settings land
- [x] 1.3 Void (2.1.318, plugins not isolated). The VPS's first
      registration honoured the tag, `v5.3.3` at `7801d061…`; whether a
      registered copy follows a changed `ref` is unmeasured, so D3's pin move
      ends with a `claude plugin list` read and, where needed, `claude plugin
      marketplace update ponytail`. A pin move. In a scratch folder with a throwaway
      `CLAUDE_CONFIG_DIR`, starting from a registered copy at `v5.3.3`,
      change the project's `ref` to `v5.3.2` and start `claude` in that
      folder (the user, in a terminal of their own). Note whether the copy
      follows it. Record the result in design.md, D3. Where the copy does
      not follow, D3's pin move gains `claude plugin marketplace update
      ponytail`
- [x] 1.4 No dialog after trust: the laptop's first run in a clean
      configuration (2.1.316) showed none and installed nothing, and the VPS
      probe showed none. The VPS's plugin loaded for that first start only,
      and an explicit install kept it (D7). The first trusted start. In the same scratch setup, with a fresh
      `CLAUDE_CONFIG_DIR`, accept the trust dialog in a folder carrying the
      new settings (the user, in a terminal of their own). Note any install
      or `userConfig` dialog that follows. Record it in design.md, D5. A
      dialog that waits for an answer stops the apply: the VPS pane has
      nobody to answer it

## 2. Settings and sync

- [x] 2.1 Failed first on the missing exports, then, with `PLUGINS` and
      `MARKETPLACE` exported and no check, 8 cases failed (the note case
      passed with the note in place). Write `bun/settings-plugins.test.ts` first, in the style of
      `bun/settings-attribution.test.ts`, with one case per scenario of
      *The tracked settings enable the harness's plugins* and *The ponytail
      marketplace is pinned by tag*, each citing its slug
      (`agent-permissions/a-consumer-without-the-plugins` and the rest).
      Give the note case a fixture line without the note. Record that they
      fail
- [x] 2.2 8 failed before sync wrote the keys; the project's-own case
      passed, since sync already kept unknown keys. Add to
      `bun/sync-settings.test.ts` the cases
      `harness-updates/a-consumer-adopts-the-plugins-through-the-sync`,
      `harness-updates/the-project-s-own-plugins-survive-a-sync` and
      `harness-updates/a-plugin-key-sync-cannot-read`. The last uses an
      array, a string and `null` under each key, and asserts that neither
      file changed. Record that they fail
- [x] 2.3 In `bun/settings.ts`, export `PLUGINS` and `MARKETPLACE` (D2,
      D3). Put the note `moved by hand — nothing updates this pin`, with the
      tag's commit, on the line before `ref`. Add both checks to
      `settings()`. In `bun/sync-settings.ts`, write both values beside
      `attribution`, with D2's shape check. Widen the `Settings` type and the
      header comment.
      Make 2.1 and 2.2 pass, and keep `bun/settings.test.ts` and
      `bun/sync-settings.test.ts` green
- [x] 2.4 Add `enabledPlugins` and `extraKnownMarketplaces` at the end of
      the harness's `.claude/settings.json`, leaving the allow list
      untouched (design.md, *Seams*). The two *harness's own* cases of 2.1
      pass
- [x] 2.5 Add a plugins section to `README.md`, with the one install a
      machine that never had ponytail needs (design.md, D6). Name each plugin, why the
      harness ships it, and what it costs. you-should-know is off by default
      at Anthropic, and its side agent, by third-party reports, spends the
      plan's limit. It runs only in first-party sessions and is
      undocumented. ponytail writes its local ledger. State the pin and that
      a hand edit moves it. To turn a plugin off locally, set `false` in
      `.claude/settings.local.json`. Cloud sessions do not load the plugins.
      A pass can miss ponytail on its first turn. The plugin ids are checked
      only by name, never against what is installed (D2). After a revert, the
      entries stay in consumers. Name the two keys in step 4 of
      *Consuming*. `bun test bun/review-docs.test.ts` passes

## 3. The level in the runner

- [x] 3.1 Four of the five new cases failed before the line; the
      laptop's-level case passed, since nothing wrote the level. In
      `orchestrator/layout-runner.test.ts`, write first the cases
      `orchestrator/the-level-is-written-before-the-session-starts`,
      `orchestrator/the-written-file-names-ultra` (it runs the `sh -c` body
      with a temporary `HOME`, twice),
      `orchestrator/the-write-runs-as-the-session-user` and
      `orchestrator/a-failed-write-leaves-the-runner-starting` (the line
      ends in `|| echo …>&2`, and the body run where
      `$HOME/.config/ponytail` is a file exits non-zero). Add
      `orchestrator/the-laptop-s-level-is-untouched`, reading the harness's
      `.claude/settings.json` and a synced consumer fixture. Cite
      `orchestrator/a-pass-s-session-reads-the-same-file` on the existing
      launcher case in `orchestrator/users.test.ts`, which already asserts
      the cleared `XDG_CONFIG_HOME`. Record that the new cases fail
- [x] 3.2 Add D4's line to `orchestrator/runner/entrypoint.sh`, before the
      tmux line, and a sentence for it in the header comment. Leave the tmux
      line unedited (design.md, *Seams*). Make 3.1 pass
- [x] 3.3 Add two sentences to the end of the first paragraph of
      `orchestrator/README.md`, step 12 (*The persistent session*), as #418
      left it. The first names ultra and the file the entrypoint writes. The
      second says to trust `/home/agent/harness` once, as step 5 does for a
      pass's clone, and `/exit`, without which the session runs without
      ponytail, and that the next start installs it (D7). Leave the step's
      numbered items alone
- [x] 3.4 In `orchestrator/session.test.ts`, under `sh` and `dash`, write
      first the cases
      `orchestrator/ponytail-is-installed-before-each-start` (the install,
      under `timeout 120`, with `DISABLE_AUTOUPDATER=1`, between `bun
      install` and each start),
      `orchestrator/a-failed-plugin-install-leaves-the-session-starting` and
      `orchestrator/no-plugin-install-without-the-clone`, and count only
      Remote Control starts in the stub that ends the loop. 24 failed under
      the two shells, the reshaped round included. Add D7's line to
      `orchestrator/runner/session.sh` and make them pass

## 4. Integration

- [ ] 4.1 `bun bun/pre-pr.ts` passes
- [ ] 4.2 No earlier install to remove first: after the probe of 05.11
      agent's configuration holds no ponytail, so the #419 Minor (remove an
      old install before this task) closes with nothing to do. After the
      image is rebuilt on the VPS, before the harness clone
      is trusted, confirm that `claude plugin list`, as `agent` in
      `/home/agent/harness`, shows no ponytail. Trust the clone and `/exit`
      as README step 12 says, before the loop is switched on (D5), and once
      the next start has run the install (D7), check that `git status` in
      `/home/agent/harness` is clean; a dirty clone switches `session.sh`'s
      call to `--scope local` (answer 5 а). Check that `claude plugin list`,
      as `agent` in a pass's clone, names ponytail; where it does not, file
      a card for an install in the pass (D5, answer 6 а). Then check four
      things. ponytail's SessionStart hook passes its rules to the model as
      hidden context and prints nothing in the pane, so read the level
      from its state. After `main` starts,
      `/home/agent/.claude/ponytail-modes/<sha256 of /home/agent/harness>`
      reads `ultra`. Asked to quote the `PONYTAIL MODE ACTIVE` line of its
      context, the session and a subagent it starts each quote
      `level: ultra`. `/home/agent/.config/ponytail/config.json`
      is owned by `agent`. `claude plugin list`, as `agent` in
      `/home/agent/harness`, shows `ponytail@ponytail` at 5.3.3. That
      command omits built-in plugins (seen on 2.1.316), so `claude plugin
      details cc-plugin-you-should-know@builtin` must resolve the id, and
      `/plugin` → Installed → Built-in, in the session, must show it
      enabled. Record the result on the card
