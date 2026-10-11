# harness-auto-bump — tasks

Four groups, so four pull requests on `feat/harness-auto-bump-1` to `-4`, in
order. design.md's step 1 is group 1 and its step 3 is group 4. Its step 2
ships as groups 2 and 3, because it carries five acceptance criteria and a
step closes at most three. Group 2 ships the checking half with its tests and
no caller, which is the seam: no consumer runs it until group 3 adds landing
and the workflow README tells them to add. Each test cites the criterion it
closes in a `// spec: harness-updates/<slug>` comment, and every file touched
stays under the 300-line cap, so new tests go in new files beside full ones.

## 1. Sync writes the policy

- [ ] 1.1 Turn `bun/bootstrap.ts`'s three hook constants into one exported
      list of `{ event, matcher?, command }`, and make `bun/settings.ts`
      assert each entry with its present shape rules: the Bash hook alone and
      blocking, the others present in blocking form. Verify: the existing
      `bun/settings.test.ts` and `bun/bootstrap.test.ts` pass unchanged in
      what they assert. If `notion-update-guard` has merged first, its hook
      becomes an entry of the list here; if this merges first, that change
      adds an entry rather than a constant.
- [ ] 1.2 Export from `bun/settings.ts` the exact values it compares — the
      `Bash(` deny and ask lists, the two `Edit` entries, `INSTALL` — and make
      its own comparisons read those exports. Verify: `bun test
      bun/settings.test.ts` passes with no assertion changed.
- [ ] 1.3 Write the settings tests in a new `bun/sync-settings.test.ts`
      first: a settings file carrying the previous version's hooks and lists
      comes out passing `settings.ts`'s check, with old hooks removed rather
      than duplicated; a project hook, the allow list, an `mcp__` ask, a
      project `Edit(...)` deny and an unknown key parse equal afterwards; a
      matcher group emptied by the removal is dropped; tab and two-space
      indentation are each kept; a missing settings file gets the hooks and
      lists; a second sync changes no byte. (Req: Sync writes every value the
      policy check dictates — §*A harness change to its policy needs no
      manual edit*; Sync leaves the consumer's own settings as it found them
      — §*The project's own settings survive a sync*)
- [ ] 1.4 Write the `bunfig.toml` tests in the same file: `[install]` is
      replaced from its header to the next header or the end; a missing
      section is appended; other tables parse equal afterwards; a layout
      whose rewrite would change another table, or leave `[install]` unequal
      to `INSTALL`, fails naming `bunfig.toml` and leaves both files
      byte-identical. (Req: Sync leaves the consumer's own settings as it
      found them — §*The project's own settings survive a sync*, §*An install
      section the rewrite would damage is left untouched*)
- [ ] 1.5 Implement the settings and `bunfig.toml` writes in a new
      `bun/sync-settings.ts`, called from `sync.ts`'s `import.meta.main`
      after the rules copy, verifying the TOML result by parsing before
      writing either file. Verify: 1.3 and 1.4 pass, and `bun test` passes
      whole.
- [ ] 1.6 Rewrite README's *Consuming* bullets on the hooks: `sync.ts`
      writes them, the permission lists and `[install]`, rather than a person
      copying them out of `bootstrap.ts`. Verify: no sentence in README still
      tells a consumer to copy a hook text, and `bun test` passes.

## 2. The bump checks a candidate

- [ ] 2.1 Add `bumpTest: string` to `bun/config.ts`'s `Config`. Verify: a
      test in `bun/config.test.ts` reads it, and an absent key throws naming
      `harness.bumpTest`.
- [ ] 2.2 Write the pin-edit tests in a new `bun/bump-pin.test.ts` first: a
      manifest whose harness spec is `github:laidrivm/harness#<40-hex>`
      exactly once changes in that one line, under tabs and under spaces; a
      spec with a short hash, a second occurrence, or a different owner fails
      before any install, naming it; after the edit, the parsed
      `dependencies.harness` equals the new spec.
- [ ] 2.3 Write the target tests in a new `bun/bump-verify.test.ts`, against
      a local `Bun.serve` stub of GitHub's commits and check-runs endpoints,
      so no test reaches the network: a head whose `test` run is in
      progress, failed, or absent, and a head equal to the pin, each exit 0
      with the tree unchanged and no target reported. (Req: A bump attempts
      only the harness's newest green commit — §*A quiet day changes
      nothing*)
- [ ] 2.4 Write the gate tests in the same file, with the install step and
      the three gate commands injected so the test controls their exit codes
      and records their order: sync, check, then `bumpTest`, each from the
      consumer's root; the first failure exits non-zero, runs nothing after
      it, and reports no target; all passing reports the target and the
      `git write-tree` of the staged edit, and nothing is pushed. (Req: A
      bump lands only what passed the consumer's checks — §*A bump that fails
      the consumer's checks does not land*, §*A bump that passes reports what
      it checked*)
- [ ] 2.5 Implement `bun/bump.ts verify` against 2.2–2.4: the API reads
      with `GITHUB_TOKEN`, the guarded pin edit, `bun install
      --ignore-scripts`, the gate, and the target and tree written as
      `$GITHUB_OUTPUT` lines when that variable is set and to stdout
      otherwise. Verify: 2.2–2.4 pass and `bun test` passes whole.

## 3. The bump lands, and consumers can run it

- [ ] 3.1 Write the landing tests in a new `bun/bump-land.test.ts`, against
      a fixture repository whose `origin` is a local bare repository:
      reproducing the reported tree commits once with the subject
      `Bump harness <old7>..<new7>` as `github-actions[bot]` and moves the
      bare repository's `main`; the install step is invoked with
      `--ignore-scripts`; a reproduced tree that differs exits non-zero and leaves the
      bare `main` where it was; an origin that moved after the checkout
      rejects the push and exits non-zero. (Req: Landing pushes exactly the
      tree that was checked — §*A checked bump lands on main*, §*A tree that
      differs from the checked one is not pushed*)
- [ ] 3.2 Implement `bun/bump.ts land <sha> <tree>` against 3.1, sharing the
      pin edit and install with `verify` and running `sync.ts` alone of the
      gate, then `git push origin HEAD:main`. Confirm `bump.ts`
      stays under 300 lines, splitting the landing half into its own module
      if not. Verify: 3.1 passes and `bun test` passes whole.
- [ ] 3.3 Add to README's *Consuming* section the consumer's workflow —
      daily `schedule` plus `workflow_dispatch`, a concurrency group, a
      `verify` job with `contents: read` and `persist-credentials: false`, a
      `land` job with `contents: write` that `needs` it and runs only when it
      reported a target, each installing and calling `bump.ts` as design.md
      shows — the `bumpTest` key with the reason it has no default, and
      that GitHub disables the schedule after 60 days without repository
      activity in a public repository, with `gh workflow enable` as the cure.
      Verify: `actionlint` passes on the workflow text copied from README
      into a scratch `.github/workflows/` file.
- [ ] 3.4 Run the migration's manual half in one consumer, on a branch of
      its own: bump to the commit that merged 3.2, add `bumpTest` and the
      workflow, merge, and trigger it with `workflow_dispatch`. Verify: the
      run ends with no target to land — the first end-to-end run, since the
      tests above inject every network and install step.

## 4. A session names a stale install

- [ ] 4.1 Write the notice tests in a new `bun/bootstrap-notice.test.ts`,
      running the hook text through `bash` with `CLAUDE_PROJECT_DIR` set to a
      fixture: a `.bun-tag` whose hash differs from the pin prints one line
      naming both and `bun install` and exits 0; a fixture whose
      `node_modules/harness/` holds only `package.json` and `.bun-tag` prints
      the same; a matching tag, a missing tag, and a tag of another form each
      print nothing and exit 0; a missing package prints the not-installed
      line and exits 0. (Req: A session names an install that lags the pin —
      §*A stale install is named at session start*, §*An install older than
      the notice is still named*, §*A current install says nothing*)
- [ ] 4.2 Add the `SessionStart` registration to `bootstrap.ts`'s list as
      inline `bun -e` text, with a `shortcut:` comment where it reads
      `.bun-tag`, saying that bun documents no such file and that the notice
      falls silent if it changes. Verify: 4.1 passes, 1.3's sync test now
      writes it, and `settings.ts`'s check requires it.
- [ ] 4.3 Add one line to README's *Consuming* section: a session prints
      the stale-install line, and `bun install` clears it. Verify: `bun test`
      passes whole.
