# ci-run-agent — tasks

Five groups, so the change ships as `feat/ci-run-agent-1` to
`feat/ci-run-agent-5`. Each group writes its failing cases first and records
that they fail against the tree as it stands. Numbers in brackets refer to the
proposal-stage `/zombies` list in the proposal's pull request; 59–61, added
at that pull request's review, and 62–67, added at the plan's, are listed in
the plan's, and 68 is *Two handlers recover one dead marker*. Groups 2 to 4
are the engine-neutral handler and flows, and wait on nothing still open:
`github-app-identity`, which groups 3 and 4 need, is archived. Group 5, the
engine's call, needs `vps-board-loop`'s group 3 merged, on the engine its
spike confirmed (moved out of group 2 on 2026-10-21, so the handler need not
wait for the engine choice).

## 1. The runner records each step's session

Closes `board-loop` §*The runner records the session of each step it
pushes*.

- [x] 1.1 Write the failing cases in a new `bun/pr-sessions.test.ts`: a
      missing file reads as no session; the last of two lines for one branch
      wins; one branch name in two repositories; a truncated line or one
      lacking `session` skipped [20, 22–24]. Add the push cases to
      `bun/board-loop-push.test.ts`: a push appends one line with every field
      before it runs; a continued branch appends a line for the new session;
      no push appends nothing; an unwritable table pushes nothing, opens
      nothing and records `open` naming the path [21, 26–28]. Add to `bun/board-loop-session.test.ts`
      that the stage session is launched with `--session-id` equal to the
      recorded id [25]. Applied: against the tree as it stood,
      `pr-sessions.test.ts` and `board-loop-push.test.ts` failed to load (no
      `pr-sessions.ts`), and [25] failed, finding no table. The fixture's home
      can now be the case's own, and its `git push` stub saves the table as
      the push finds it, which is how [21] proves the line came first
- [x] 1.2 Add `bun/pr-sessions.ts` (append, lookup) as `design.md` fixes,
      give `session()` an extra-flags argument, launch the stage session with
      `--session-id`, and append from `board-loop-push.ts`. Verify with 1.1
      and with `bun bun/file-size.ts`, which must keep `board-loop.ts` under
      300 lines
- [x] 1.3 In `README.md`'s runner paragraph, name the table and that only the
      orchestrator reads it. Verify by reading the paragraph back

## 2. The event handler

Closes `orchestrator` §*An event is handled only once its signature verifies*
and §*A delivery is handled at most once*.

- [x] 2.1 Write the failing cases in a new `bun/on-event.test.ts`, running the
      handler as a process with a temporary home and `PASS_SECRETS` pointed
      at a temporary secrets directory [1–16, 19, 59, 60, 62, 63, 68].
      Cite each scenario as `// spec: orchestrator/<slug>`. [17] and [18]
      need a routed event, so they are group 3's. Applied: against the tree
      as it stood the file failed to load (no `on-event.ts`). The races [4,
      59, 60, 68] run `claim()` in processes that hold until released, so
      exactly one winner is a fact, never a timing
- [x] 2.2 Add `bun/on-event.ts` in the order `design.md` fixes (shape,
      body, secret, signature, delivery, routing), with every
      event ignored until group 3 routes `workflow_run`. Verify with 2.1

## 3. The CI flow on a pull request

Closes `orchestrator` §*A failed CI run starts an agent only for a pull
request the loop opened*, §*A pull request gets at most three fix attempts*
and §*A fix reaches the pull request only as new commits the runner pushes*.

- [ ] 3.1 Probe `--json-schema` on a stub session in a clone with the
      harness's hooks registered. Record whether `structured_output` arrives
      with the turn gate and `Stop` hooks in place. If it does not, switch the
      parse to a `CI-OUTCOME:` last line before 3.3, as `design.md`'s risk
      says
- [ ] 3.2 Write the failing cases in a new `bun/ci-run.test.ts` against a
      `Bun.serve` API through `GITHUB_API_URL`, a stub `claude` and a stub
      `gh`, with a clone fixture [17, 18, 29–54, 61, 64–67]
- [ ] 3.3 Add `bun/ci-run.ts`. Give `github-app.ts`'s mint a permissions
      argument, and route `workflow_run` to the flow from `on-event.ts`,
      which refuses a routed event without the App's settings and marks the
      delivery acted before the flow first posts or starts a session.
      Verify with 3.2 and `bun test`
- [ ] 3.4 Reconcile the sites that say a fix is a person's job, or that
      `gh run view` is the agent's: grep `core/` and `README.md` for
      `--log-failed`, and `core/autonomy.md` for CI. Verify by reading each
      hit back

## 4. The scheduled and flaky routes

Closes `orchestrator` §*A failed scheduled run files an idea card* and §*A
run that passed on a later attempt is a flaky finding*.

- [ ] 4.1 Write the failing cases in `bun/ci-run.test.ts` for the two fresh
      session routes [38, 55–58]
- [ ] 4.2 Add both routes to `bun/ci-run.ts`. Verify with 4.1 and `bun test`
- [ ] 4.3 Remove from `core/testing.md` the line saying CI flakes wait for
      this flow, if the stopgap still carries one. Verify with
      `git grep -n "run_attempt" core`

## 5. The engine's webhook call

Needs `vps-board-loop`'s group 3 merged, on the engine its spike confirmed.

- [ ] 5.1 Copy `bun/` into the runner image at `/opt/orchestrator/bun/`,
      root-owned, and add `github_webhook_secret` to the secret files the host
      README provisions. Add the engine's webhook workflow under
      `orchestrator/workflows/`: it answers at once, then calls the handler
      as the contract in `design.md` says, with whatever host change that
      call needs (for SSH, a second forced-command key). Extend
      `orchestrator/layout.test.ts` for both. Verify with
      `bun test orchestrator`
- [ ] 5.2 Write the user acts of `proposal.md` into the host README in order,
      and record there that a `ping` from each repository's new webhook prints
      `ignored`. Verify by reading the README back
