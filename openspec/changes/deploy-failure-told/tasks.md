# deploy-failure-told — tasks

One pull request per group, each under the diff budget. In each group the
failing cases come first, their failure seen before the code changes, each
cited as `// spec: <capability>/<slug>`;
a case that pins behaviour the change keeps says so and is not expected to
fail first. `put()` and its `shortcut:` comment are not touched.

## 1. The prompt hook reports a late failure

- [x] 1.1 Failing cases in `orchestrator/layout-deploy.test.ts`: `run()` maps
      a command naming `/opt/orchestrator/<file>` to the tree file the
      Dockerfile's `COPY --chmod=0755 runner/<file> /opt/orchestrator/<file>`
      line names, read from `orchestrator/runner/Dockerfile`, and fails on a
      command naming a path no such line copies. Cases: a submitted prompt
      with the failure file prints the ask line and the file's line, moves it
      to `.harness-deploy-failed.reported`, and the next prompt prints nothing
      (`orchestrator/a-failure-after-main-is-up`); a prompt with no failure
      file prints nothing and still removes the fresh-session mark
      (`orchestrator/a-prompt-with-no-failure`); a second failure reported
      while an earlier `.reported` file exists is printed and replaces it
      (`orchestrator/a-failure-after-main-is-up`); a read-only directory at
      `.harness-deploy-failed.reported`, which the move cannot enter, still
      leaves the report printed, the hook exiting 0 and the file in place,
      and the next prompt reports it again, for the start hook as for the
      prompt hook (`orchestrator/the-failure-file-cannot-be-moved-aside`);
      the existing start cases
      keep passing (`orchestrator/the-session-starts-after-a-failed-deploy`)
- [x] 1.2 A pinning case in `orchestrator/deploy-session.test.ts`, passing
      before the change since `deploy.sh` is not changed for this gap: a
      fresh session, the push failing after `main` is up — the failure file
      names the push and the head after the run, `up` saw no failure file,
      and a second run with the push still failing leaves the file again
      (`orchestrator/a-failure-after-main-is-up`)
- [x] 1.3 Then `orchestrator/runner/deploy-failed.sh` (mode 0755 in the
      commit) carrying the start hook's report and exiting 0 whatever its
      move does; the Dockerfile copies it to
      `/opt/orchestrator/deploy-failed.sh` beside the other scripts, and its
      mode check fails the build when that file, or any other there but the
      sourced `clone-name.sh`, is not executable and readable by others or
      is writable by group or others, a case in
      `orchestrator/users.test.ts` running the `RUN test -z` line over the
      path's modes; the
      `SessionStart` `startup|clear|resume` entry and the `UserPromptSubmit`
      entry, beside the mark's removal, run it. Verify
      `bun test orchestrator/layout-deploy orchestrator/deploy-session`
      passes and `shellcheck orchestrator/runner/deploy-failed.sh` is clean
- [x] 1.4 The comments and docs that name a start-only report say a start or
      a prompt: `deploy.sh`'s header (*which the session's next start
      reports*), the Dockerfile's comment above the managed settings' `COPY`,
      and `orchestrator/README.md`'s deploy section; verify by reading each
      passage back

## 2. A rolled-back record that cannot be written

- [ ] 2.1 Failing cases in `orchestrator/deploy-session.test.ts`: the state
      directory unwritable for `rolled-back` (a directory in its place) with
      `main` not coming back — the failure file reads
      `the wait for main and the rolled-back record failed at <head>`, the
      journal says the head could not be recorded, and the tag back and the
      runner's `up` still run
      (`orchestrator/the-rolled-back-record-cannot-be-written`); the same
      with the tag back failing, and with the rollback's `up` failing, each
      names its step and the record
      (`orchestrator/the-rollback-fails-without-its-record`)
- [ ] 2.2 Then `rollback()` writes `rolled-back` first and, on a failed
      write, appends ` and the rolled-back record` to each step it hands
      `failed`; the header comment and `rollback()`'s say so. Verify
      `bun test orchestrator/deploy-session` passes
- [ ] 2.3 `orchestrator/README.md`: the passage on `could not be recorded as
      rolled back` says the failure file names it too; verify by reading it
      back

## 3. The newest test run decides

- [ ] 3.1 Failing cases in a new `bun/green-run.test.ts` for
      `green(runs)`: no runs, another app's success alone, a pending, failed
      and successful single run; an older `success` with a newer `failure`
      or pending run is not green, an older `failure` with a newer `success`
      is, each with the newer run listed first and listed last. For
      `collect(pages)`: no pages and pages short of the first's
      `total_count` answer `more`; pages that reach it answer their runs
      together; a body with no `total_count`, and a last page with no runs
      while the count is short, throw. Run as a script over a JSON array of
      bodies, it exits 0, 1, 2 and 3 for green, not green, unreadable
      standard input and another page wanted
- [ ] 3.2 Then `bun/green-run.ts`, importing nothing, its comment naming the
      per-suite reading of `filter=latest`; add it to `stryker.config.json`'s
      `mutate` if the mutation floor's rules call for it. Verify
      `bun test bun/green-run` passes
- [ ] 3.3 Failing cases in `bun/bump-verify.test.ts`'s *choosing a target*,
      `bun/bump.fixture.ts`'s `CheckRun` and `GREEN` gaining ids: an older
      run's `success` and a newer `failure` or pending one report no target
      and change nothing
      (`harness-updates/an-older-check-suite-s-success-does-not-make-the-head-green`);
      an older `failure` and a newer `success` target the head
      (`harness-updates/a-newer-check-suite-s-success-makes-the-head-green`);
      with the fixture answering `total_count` and serving runs a page at a
      time by `per_page` and `page`, a newer `failure` on the second page
      after an older `success` on the first reports no target
      (`harness-updates/test-runs-on-more-than-one-page`); the existing
      cases keep passing
- [ ] 3.4 Then `greenHead()` in `bun/bump.ts` reads pages of
      `per_page=100` while `collect()` answers `more` and calls `green()`.
      Verify `bun test bun/bump` passes
- [ ] 3.5 Failing cases in `orchestrator/deploy.test.ts`, with
      `orchestrator/deploy.fixture.ts`'s `runs()` able to answer several runs
      with ids, the fixture's checkout gaining `bun/green-run.ts` beside
      `orchestrator/`, and its `docker run` stub running `--entrypoint bun`
      on the `--mount` source it is handed: an older suite's `success` and a
      newer `failure` or pending run move nothing and exit 0
      (`orchestrator/an-older-check-suite-s-success`); an older `failure`
      and a newer `success` deploy the head
      (`orchestrator/a-newer-check-suite-s-success`); a newer `failure` on a
      second page after an older `success` on the first moves nothing, both
      pages read, and a second page with no runs while the count is short
      reads as a check that cannot be read
      (`orchestrator/check-runs-on-more-than-one-page`); a script that exits 2
      reads as a check that cannot be read; the existing pending, failed,
      absent and other-app cases keep passing. Two recovery cases: with the
      image's `/opt/orchestrator/bun/green-run.ts` absent (a build that
      failed after the fast-forward, or a rollback to an image from before
      the module), the read still decides from the checkout's file; and the
      read's command names the checkout's file, never the image's path
      (`orchestrator/an-image-older-than-the-check`)
- [ ] 3.6 Then `deploy.sh`'s `green()` reads `$runs&per_page=100&page=<n>`
      and pipes the bodies read so far, as a JSON array, to
      `docker run --rm -i --mount "type=bind,source=${PWD%/*}/bun/green-run.ts,target=/green-run.ts,readonly" --entrypoint bun "$image" /green-run.ts`,
      reading the next page while it exits 3, and maps its other exits as it
      maps `jq`'s today, its comment saying why the checkout's file. Verify
      `bun test orchestrator/deploy` passes
- [ ] 3.7 The implementation's pull request body names the check by hand
      from design *Risks*: before merging, the merge commit's `test` runs
      under `filter=latest` are one. Verify by reading the body back

## 4. A retry keeps the previous image

- [ ] 4.1 Failing cases in `orchestrator/deploy-session.test.ts`, two tests.
      First, a run whose push fails after `main` is up, then a second run of
      the same head whose wait for `main` fails: the second run logs no tag
      of the container's image as `orchestrator-runner:previous`, still
      builds, brings up and waits, and its rollback tags `previous` back
      (`orchestrator/a-retry-after-a-late-failure`). Second, a `test.each`
      with two rows. In one, `brought-up` names another head, and the run
      tags the container's image as before
      (`orchestrator/a-new-head-after-a-brought-up-one`). In the other, a
      directory sits at `brought-up`: no `up` runs, the failure file names
      `the brought-up record` and the head, and the run exits 1
      (`orchestrator/the-brought-up-record-cannot-be-written`)
- [ ] 4.2 Then `locked()` writes the head to `$state/brought-up` right
      before `up`, and a failed write fails the step `the brought-up record`.
      The tag before the build is skipped while that record names the head.
      The header comment names the third record, and the tag's comment says
      why it is skipped. Verify `bun test orchestrator/deploy-session
      orchestrator/deploy` passes
- [ ] 4.3 `orchestrator/README.md`'s deploy section names
      `/var/lib/harness-deploy/brought-up` beside the other two records.
      Verify by reading the passage back

## 5. Integration

- [ ] 5.1 `bun test` and `bun bun/pre-pr.ts` pass on the branch
