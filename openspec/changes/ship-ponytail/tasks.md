# Tasks

The change is one pull request, well within the 800-line diff budget. Group 1
runs before any code, every probe in a scratch setup. Its results go into design.md, and a result that
contradicts D5 or D6 stops the apply for the user. The command guard refuses
an agent's call that redirects Claude Code's configuration (seen 03.11 on
`XDG_CONFIG_HOME`), so each probe names who runs it.

## 1. Probes (Claude Code 2.1.316)

- [ ] 1.1 A plugin id under `builtin` that no build ships. In a scratch
      directory, give `.claude/settings.json` the entry
      `"no-such-plugin@builtin": true`, then run `claude plugin list` there,
      in a throwaway `CLAUDE_CONFIG_DIR` (the user, in a terminal of their
      own). Record in design.md, *Risks*, whether it errors, warns or says
      nothing, and whether a session still starts
- [ ] 1.2 The laptop's entry (D6, answer 4 а). With the user's own
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
- [ ] 1.3 A pin move. In a scratch folder with a throwaway
      `CLAUDE_CONFIG_DIR`, starting from a registered copy at `v5.3.3`,
      change the project's `ref` to `v5.3.2` and start `claude` in that
      folder (the user, in a terminal of their own). Note whether the copy
      follows it. Record the result in design.md, D3. Where the copy does
      not follow, D3's pin move gains `claude plugin marketplace update
      ponytail`
- [ ] 1.4 The first trusted start. In the same scratch setup, with a fresh
      `CLAUDE_CONFIG_DIR`, accept the trust dialog in a folder carrying the
      new settings (the user, in a terminal of their own). Note any install
      or `userConfig` dialog that follows. Record it in design.md, D5. A
      dialog that waits for an answer stops the apply: the VPS pane has
      nobody to answer it

## 2. Settings and sync

- [ ] 2.1 Write `bun/settings-plugins.test.ts` first, in the style of
      `bun/settings-attribution.test.ts`, with one case per scenario of
      *The tracked settings enable the harness's plugins* and *The ponytail
      marketplace is pinned by tag*, each citing its slug
      (`agent-permissions/a-consumer-without-the-plugins` and the rest).
      Give the note case a fixture line without the note. Record that they
      fail
- [ ] 2.2 Add to `bun/sync-settings.test.ts` the cases
      `harness-updates/a-consumer-adopts-the-plugins-through-the-sync`,
      `harness-updates/the-project-s-own-plugins-survive-a-sync` and
      `harness-updates/a-plugin-key-sync-cannot-read`. The last uses an
      array, a string and `null` under each key, and asserts that neither
      file changed. Record that they fail
- [ ] 2.3 In `bun/settings.ts`, export `PLUGINS` and `MARKETPLACE` (D2,
      D3). Put the note `moved by hand — nothing updates this pin`, with the
      tag's commit, on the line before `ref`. Add both checks to
      `settings()`. In `bun/sync-settings.ts`, write both values beside
      `attribution`, with D2's shape check. Widen the `Settings` type and the
      header comment.
      Make 2.1 and 2.2 pass, and keep `bun/settings.test.ts` and
      `bun/sync-settings.test.ts` green
- [ ] 2.4 Add `enabledPlugins` and `extraKnownMarketplaces` at the end of
      the harness's `.claude/settings.json`, leaving the allow list
      untouched (design.md, *Seams*). The two *harness's own* cases of 2.1
      pass
- [ ] 2.5 Add a plugins section to `README.md`. Name each plugin, why the
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

- [ ] 3.1 In `orchestrator/layout-runner.test.ts`, write first the cases
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
- [ ] 3.2 Add D4's line to `orchestrator/runner/entrypoint.sh`, before the
      tmux line, and a sentence for it in the header comment. Leave the tmux
      line and `session.sh` unedited (design.md, *Seams*). Make 3.1 pass
- [ ] 3.3 Add two sentences to the first paragraph of `orchestrator/README.md`,
      step 12 (*The persistent session*). The first names ultra and the
      file the entrypoint writes. The second says to trust
      `/home/agent/harness` once, as step 5 does for a pass's clone,
      without which the session runs without ponytail. Leave the step's
      numbered items, which `fix/runner-image-bun-modes` edits, alone

## 4. Integration

- [ ] 4.1 `bun bun/pre-pr.ts` passes
- [ ] 4.2 After the image is rebuilt on the VPS, before the harness clone
      is trusted, confirm that `claude plugin list`, as `agent` in
      `/home/agent/harness`, shows no ponytail. Trust the clone as README
      step 12 says, before the loop is switched on (D5), then check four
      things. ponytail's SessionStart hook passes its rules to the model as
      hidden context and prints nothing in the pane, so read the level
      from its state. After `main` starts,
      `/home/agent/.claude/ponytail-modes/<sha256 of /home/agent/harness>`
      reads `ultra`. Asked to quote the `PONYTAIL MODE ACTIVE` line of its
      context, the session and a subagent it starts each quote
      `level: ultra`. `/home/agent/.config/ponytail/config.json`
      is owned by `agent`. `claude plugin list`, as `agent` in
      `/home/agent/harness`, shows `ponytail@ponytail` at 5.3.3 and
      `cc-plugin-you-should-know@builtin`. Record the result on the card
