# deploy-failure-told — tasks

One pull request. In each group the failing cases come first, their failure
seen before the code changes, each cited as `// spec: orchestrator/<slug>`.
`put()` and its `shortcut:` comment are not touched.

## 1. The prompt hook reports a late failure

- [ ] 1.1 Failing cases in `orchestrator/layout-deploy.test.ts`: `run()` maps
      a command naming `/opt/orchestrator/<file>` to the tree file the
      Dockerfile's `COPY --chmod=0755 runner/<file> /opt/orchestrator/<file>`
      line names, read from `orchestrator/runner/Dockerfile`, and fails on a
      command naming a path no such line copies. Cases: a submitted prompt
      with the failure file prints the ask line and the file's line, moves it
      to `.harness-deploy-failed.reported`, and the next prompt prints nothing
      (`a-failure-after-main-is-up`); a prompt with no failure file prints
      nothing and still removes the fresh-session mark
      (`a-prompt-with-no-failure`); a second failure reported while an
      earlier `.reported` file exists is printed and replaces it
      (`a-failure-after-main-is-up`); the existing start cases keep passing
      (`the-session-starts-after-a-failed-deploy`)
- [ ] 1.2 Failing case in `orchestrator/deploy-session.test.ts`: a fresh
      session, the push failing after `main` is up — the failure file names
      the push and the head after the run, `up` saw no failure file, and a
      second run with the push still failing leaves the file again
      (`a-failure-after-main-is-up`)
- [ ] 1.3 Then `orchestrator/runner/deploy-failed.sh` (mode 0755 in the
      commit) carrying the start hook's report; the Dockerfile copies it to
      `/opt/orchestrator/deploy-failed.sh` beside the other scripts; the
      `SessionStart` `startup|clear|resume` entry and the `UserPromptSubmit`
      entry, after the mark's removal, run it. Verify
      `bun test orchestrator/layout-deploy orchestrator/deploy-session`
      passes and `shellcheck orchestrator/runner/deploy-failed.sh` is clean
- [ ] 1.4 `orchestrator/README.md`'s deploy section says the session reports
      the failure file at its next start or prompt, whichever comes first;
      verify by reading the passage back

## 2. A rolled-back record that cannot be written

- [ ] 2.1 Failing cases in `orchestrator/deploy-session.test.ts`: the state
      directory unwritable for `rolled-back` (a directory in its place) with
      `main` not coming back — the failure file reads
      `the wait for main and the rolled-back record failed at <head>`, the
      journal says the head could not be recorded, and the tag back and the
      runner's `up` still run (`the-rolled-back-record-cannot-be-written`);
      the same with the tag back failing, and with the rollback's `up`
      failing, each names its step and the record
      (`the-rollback-fails-without-its-record`)
- [ ] 2.2 Then `rollback()` writes `rolled-back` first and, on a failed
      write, appends ` and the rolled-back record` to each step it hands
      `failed`; the header comment and `rollback()`'s say so. Verify
      `bun test orchestrator/deploy-session` passes
- [ ] 2.3 `orchestrator/README.md`: the passage on `could not be recorded as
      rolled back` says the failure file names it too; verify by reading it
      back

## 3. The newest test run decides

- [ ] 3.1 Failing cases in `orchestrator/deploy.test.ts`, with
      `orchestrator/deploy.fixture.ts`'s `runs()` able to answer several runs
      with ids: an older suite's `success` and a newer `failure` or pending
      run move nothing and exit 0 (`an-older-check-suite-s-success`); an
      older `failure` and a newer `success` deploy the head
      (`a-newer-check-suite-s-success`); each with the newer run listed
      first and listed last in the response; the existing pending, failed, absent
      and other-app cases keep passing
- [ ] 3.2 Then `green()` filters `github-actions` runs and takes
      `max_by(.id)`'s conclusion, its comment naming the per-suite reading of
      `filter=latest`. Verify `bun test orchestrator/deploy` passes

## 4. Integration

- [ ] 4.1 `bun test` and `bun bun/pre-pr.ts` pass on the branch
