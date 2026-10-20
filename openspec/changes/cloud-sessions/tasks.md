# cloud-sessions — tasks

Four groups, so the change ships as `feat/cloud-sessions-1` to `-4`.
Numbers in brackets are the ideas of the proposal-stage `/zombies` run listed
in the proposal's pull request. Each group writes its failing cases first and
records that they fail against the tree as it stands. Every test closing a
scenario of this change carries its `// spec:` citation. The agent-autonomy
scenarios no test can read — a routine's prompt lives in claude.ai — stay
uncited, and the archive raises the uncited floor by their count with that
reason.

## 1. Pull requests read through REST

Closes `stage-goal` §*A branch's pull requests are read through GitHub's REST
API*.

- [x] 1.1 Write the failing cases in a new `bun/pull-requests.test.ts`, with a
      `gh` stub on `PATH` that logs its arguments and a fixture repository
      whose `origin` each case sets: an empty list is a list [1]; no `origin`
      fails with no `gh` call [2]; `open`, `closed` with `merged_at` and
      `closed` with `merged_at: null` translate to `OPEN`, `MERGED` and
      `CLOSED`, `headRefOid` from `head.sha` [3–5]; the API's order is kept
      and a mixed list translates element by element [6, 7]; an empty or
      missing `merged_at` and an unknown or upper-case `state` read as
      `CLOSED` [8, 9]; the query ends in `per_page=100` with no
      `--paginate` [10]; a branch holding `&`, `#` and `/` is encoded [11];
      `origin` in HTTPS, scp, proxy and local-path form, a trailing slash
      included, gives `o/r` [12–15]; one segment, or a segment holding a space
      or `%`, fails with no `gh` call [16, 17]; an `insteadOf` rewrite is
      followed [18]; no `gh pr` or `gh api graphql` call [19]; a non-object
      element, one whose `head.repo` is `null`, and one from another
      repository of the same owner are left out, and one whose
      `head.repo.full_name` differs from `origin`'s only in case is kept
      [20, review of #185]; a JSON object, a 403
      exit and output that is not JSON each fail [21, 22, 24]
- [x] 1.2 Move the `gh` stubs in `bun/goal-check.fixture.ts` and
      `bun/board-loop.fixture.ts` to the REST query and its answer's shape,
      give each fixture repository an `origin`, and change the assertions in
      `goal-check-io.test.ts`, `goal-check.test.ts`,
      `board-loop-takeable.test.ts` and the timeout cases that read
      `gh pr list` calls or GraphQL-shaped output; the hanging `gh` is killed
      at `HARNESS_GH_TIMEOUT_MS` on the REST call [23, 25, 26]. See them fail
- [x] 1.3 Rewrite `readPullRequests` in `bun/pull-requests.ts` as design.md
      D5 and D6 say, its `fields` parameter dropped, the `per_page` limit in
      a `shortcut:` comment; update its two callers. See 1.1 and 1.2 pass and
      the whole `bun test` green
- [x] 1.4 Reconcile the sites that name the old read: the header of
      `bun/pull-requests.ts`, the `gh` stub comment in
      `bun/board-loop.fixture.ts`, and any hit of
      `git grep -n -e "gh pr list" -e "headRefOid" -- bun core README.md
      openspec/specs` outside the `coderabbit` skill, whose reads are no part
      of this change; verify by reading each hit back

## 2. The cloud start, its setup script and the routine rule

Closes `cloud-sessions` §*A cloud session installs the harness as it starts*
and §*The cloud environment's setup script installs CI's bun*, and
`agent-autonomy` §*A routine's prompt is the declared line and one tracked
skill*.

- [ ] 2.1 Write the failing cases in `bun/bootstrap-notice.test.ts`, with a
      `bun` stub ahead on `PATH` that logs an `install` call, answers it with
      the exit and output the case sets, and hands `-e` to the real bun: no
      install with `CLAUDE_CODE_REMOTE` unset, empty, `TRUE`, `1` or
      `true ` [27, 28, 30]; with `true`, exactly `install --frozen-lockfile
      --ignore-scripts`, run in `CLAUDE_PROJECT_DIR`, in the working
      directory when that is unset, and in a directory holding a space, and
      nothing printed on success [29, 31, 32]; a failure prints one line with
      bun's last line, or with no empty quote when bun printed nothing, then
      the notice's not-installed line, and exits 0 [33–35]; no `bun` on
      `PATH` exits 0 [36]; with the real bun in a temp project whose lockfile
      disagrees with `package.json`, neither file changes [37]
- [ ] 2.2 Write the failing cases in a new `bun/bun-version.test.ts` against
      fabricated trees and then the real one: no setup script line, and no
      workflow `bun-version`, each fail naming what is missing [39, 40]; all
      sites at one version pass [41]; two workflows that disagree fail naming
      each [42]; `bun@1.4` and `bun@latest` are no exact version [43]; a
      quoted `bun-version` is read [44]; a missed README bump snippet fails
      naming `README.md` and both versions [45]. The real tree fails until 2.4
- [ ] 2.3 Prefix `NOTICE` in `bun/bootstrap.ts` as design.md D1 and D2 say,
      and rewrite its comment to name the install and why it runs here; write
      the new text into the tracked `.claude/settings.json` with the sync, and
      see 2.1, the settings and sync tests [38] and the whole `bun test` pass
- [ ] 2.4 Add the README's *Cloud sessions* section: one repository
      attached, Trusted network, no variables or secrets; the setup script
      line `npm i -g bun@1.4.2` and, beside it, that nothing updates it but a
      hand edit of every `bun-version` site; the install at session start;
      what the cloud lacks — GraphQL, so `gh pr` and the `coderabbit` skill's
      reads, `gates.jsonl` past the VM, `.githooks`, a gate on the built-in
      GitHub tools; and routines carrying only read-and-report flows, pointing
      to `core/autonomy.md`. Amend *Working on the harness*'s "A clone
      therefore runs `bun install` before any other command" and the
      consumer bullet on the `SessionStart` hook to name the cloud install.
      See 2.2 pass on the real tree
- [ ] 2.5 Add a *Routines* section to `core/autonomy.md` stating the rule
      the `agent-autonomy` delta fixes, with the trial routine's two lines as
      its example; verify it against `core/rules.md`'s quality bar by reading
      it back
- [ ] 2.6 Add `core/skills/cloud-probe/SKILL.md` as design.md D7 lists it,
      with no `disable-model-invocation`, its link
      `.claude/skills/cloud-probe` → `../../core/skills/cloud-probe`, and its
      row in the README's skill table; see the skills-table and marker tests
      pass [46]
- [ ] 2.7 Search the four places for the statements this group changes —
      "lets only the install through", "runs `bun install` before any other
      command", "The harness is not installed" — and reconcile each hit or
      name the change that will

## 3. The self-pin past groups 1 and 2

Needs groups 1 and 2 merged. Closes no requirement: the gates and the goal
check a cloud session runs come from `node_modules/harness/`, so group 4 can
read them live only once the pin holds this change's code.

- [ ] 3.1 Move the self-pin to the `main` commit holding groups 1 and 2 whose
      `test` run passed, as README's *Working on the harness* says.
      `bun install` prompts, so the user approves it (unattended: user —
      report `BLOCKED`, naming the command). Verify: the lockfile's workspace
      block names the pin once, and a new session's notice prints nothing

## 4. Live checks in the cloud

Needs group 3 merged. Closes no requirement; it reads live what no test can,
records it in this group's pull request, and amends the design where the
cloud disagrees.

- [ ] 4.1 **User act.** Start one cloud session on
      `harness` alone, in the `harness` environment, with the prompt
      `/cloud-probe cloud-sessions`. Record in the pull request's *Check by
      hand* list: no prompt for `bun install` and the install at the pin; the
      form of `origin`'s URL; the turn gate's mark present; the commit on
      `main` refused by the command guard; the goal check's last line naming
      no pull request for `main` rather than an unreadable state; and whether
      the first tool call ran after the install or met the bootstrap's hint
- [ ] 4.2 **User act, in the same session.** Ask it to post a comment on
      this change's card whose text does not open with the mark, decline the
      prompt that shows, and have it print the `question-gate` and
      `command-guard` lines of `gates.jsonl`. Record whether one names the
      call, and whether the guard's refusal of 4.1's commit is there, which
      design.md D8 needs before an absent line can mean the hook did not fire
- [ ] 4.3 **User act.** Create the trial routine: once a day, repository
      `harness`, environment `harness`, prompt `This session runs
      unattended.` and, on the next line, `/cloud-probe cloud-sessions`.
      After its first run, record its final message beside 4.1's and switch
      the routine off
- [ ] 4.4 Where 4.1–4.3 disagree with design.md — D1's order against the
      first tool call, D6's parse against `origin`'s form, D8's hook — amend
      it through `/opsx:update` in this group's branch; if 4.2 shows, as D8
      reads it, that the question gate did not fire, file an `idea` card on
      the `Harness` board for a `PreToolUse` copy (unattended: card — file it and name it in the
      report). Verify: `openspec validate cloud-sessions` passes
