# Review toolkit

Indexed from `CLAUDE.md`, which holds the rule quality bar and the
single-source rule this file inherits.

Review skills live in `.claude/skills/`, symlinked into the harness package
`bun.lock` pins — edit them in the harness repository, not here;
`/ponytail-review` comes from the ponytail plugin.

Show a review skill's report, then act on it in the same turn: apply the
findings that hold against the current code, and say which you skip and why.
The report alone is never the deliverable — a turn ending on a gate line that
reads `OPEN` over unapplied fixes is a turn abandoned halfway. Close it, or
write `BLOCKED` and name what only the user can settle. `OPEN` over a proposed
Major or Critical dismissal is one exception: that one ends the turn by
design, because settling it is the user's. `/coderabbit`'s `OPEN` over a head
commit the bot has not reviewed yet is the other: there is nothing to act on
until the review lands, and the next run picks it up. A head with no findings
counts as reviewed once its `CodeRabbit` status is `success` with the
description `Review completed`; a draft's `success` reads `Review skipped:
draft pull request`, and marking the pull request ready starts the review of
its head. A head whose status reads `Review skipped…`, or names a rate or usage
limit, gets no review on its own — stop waiting on it and report it.

## The skills

- `/zombies [feature]` — test ideas via the ZOMBIES heuristic. With args:
  works from a feature description (pre-code). Without args: diff mode,
  cross-referenced against existing tests.
- `/warm [base]` — WARM check of dependencies the branch pulls in. The change
  is not done until its dependencies are vetted.
- `/ponytail-review` — over-engineering pass over the diff, available and not
  a gate. It stood in the sequence below until 2026-08-26 and was removed on
  its own record: across the eight branches of that session it returned eight
  findings, every one about shape and none a defect, and three branches it
  read returned nothing at all. Worse, it read an enumeration the `CLAUDE.md`
  scan rule forbids and accepted it, which `/coderabbit` then caught — so the
  step was not merely quiet but agreeing. `docs/context/pipeline-yield-*.md`
  holds the counts. Run it when a diff feels overbuilt; nothing waits on it.
- `/triage [base]` — risk-ordered map of the branch diff. Invoke it yourself.
  It returns no findings by design, so acting on it means reading the files it
  ranks High and Medium, reporting the defects they hold, and grepping every
  decision or value the diff changes for the sites that restate it.
- `/code-review` — Claude's own review of the working branch, before there
  is a PR: the local review. Invoke it yourself, as `/code-review high
  <base>` from the branch's own worktree, `<base>` being the ref the runner
  measured from (`origin/main` in a worktree), which the skill reads as `git
  diff <base>...HEAD` in the tree it runs in: the level is named because
  `/code-review` with none reuses the last one typed, and the base because
  with no target the skill diffs against an upstream or the local `main`,
  which in a worktree trails `origin/main`. Pass it nothing else: its
  arguments that post write under the user's name on a pull request that has
  none yet, and the one that fixes applies findings before they are
  verified. It runs only while no pull request is open on the branch, a
  draft counting as open: a push into an open one skips it while the earlier
  steps run, because CodeRabbit reviews
  that head on the pull request — a draft's once it is marked ready — and
  `/coderabbit` disposes of its findings. Read the pull request's state
  before the sequence starts, as `git-and-prs.md` has it read before a review
  pass, and never infer it from what the push carries. A branch whose only
  pull request was closed unmerged has none open and runs it again; a state
  the read could not get runs it too, and the report says the state was
  unread, since a skipped review is the costlier mistake. A review that does
  not return — a usage limit, an error, a refused call — or whose findings
  name no file the branch's diff changes (the runner's `changedPaths(<base>)`
  in `bun/pre-pr-steps.ts`), having read another diff or another tree, is
  reported and the push goes on without the gate rather than blocking the
  branch. One finding on an unchanged file beside findings on changed ones —
  a caller the change breaks — is kept and verified like the rest, and an
  empty review proves nothing either way and passes. `/code-review` names no
  severity, so the session grades each finding 🔵 Trivial, 🟡 Minor, 🟠 Major
  or 🔴 Critical — the ladder `/coderabbit` reads — while verifying it,
  disposes of it on that grade, and names the grade beside each finding in
  its report. A finding that survives verification is applied without
  asking, whatever its severity — the branch is unpushed, so being wrong
  costs a `git checkout`. Dismissing a 🟠 Major or 🔴 Critical goes the
  other way: it is put to the user with what the review missed, and the gate
  line reads `OPEN` until they settle it, because a wrong dismissal reaches
  the merge where a wrong fix does not (unattended: card — hand it on with
  what the review missed, and list it in the pull request's body as `autonomy.md`'s
  `agent` sets out). At most three reviews with fixes between them; stop
  early the moment a review returns nothing above 🟡 Minor, and if Major or
  above survives the third, report it and stop rather than starting a fourth
  (unattended: agent — push and open the pull request, listing the finding
  as still open; under the board loop, name the pull request with that
  listing in its body, and the runner opens it).
  Collect Minor findings across all passes and report them once at the end,
  each fixed or skipped with its reason, and the session writes the
  `CODE-REVIEW gate:` line itself, since the built-in skill prints none: it
  ends the disposition on `CODE-REVIEW gate: PASS|OPEN|BLOCKED — …`, `OPEN`
  over a proposed Major or Critical dismissal and `BLOCKED` over a Major or
  above the third review left. The review reads `CLAUDE.md`
  and `core/rules.md`, not the docs the rulebook indexes, so a rule kept in
  one of those is read back by CodeRabbit on the pull request rather than by
  this review.
- `/coderabbit [pr]` — chews the bot's PR comments. Run it once the bot has
  reviewed the head commit, never to wait for that, because the bot's
  review arrives on its own schedule and waiting for it burns a session doing
  nothing — the cost is the wait, which a synchronous local review does not
  have, and that is the whole difference between this bullet and the one above
  it. A run that finds no review of the head commit ends `OPEN` after one
  read. Once a PR is open, say so and stop —
  do not poll the checks, do not sleep on a timer, do not re-run `gh` to see
  whether the bot has posted. Once the review has landed, dispose of the
  findings on `/code-review`'s finding-disposal terms alone — not its base,
  its changed-file check or its `CODE-REVIEW` gate line, which are the local
  review's: any verified finding
  applied without asking, a Major or Critical dismissal put to the user
  (unattended: card — hand it on with what the bot missed), Minor read and
  then fixed or skipped with its reason, overriding the skill's "No fixes
  before approval". This policy is the approval for the fixes, because a
  wrong fix on an open PR costs one more commit on a branch already under
  review, where a wrong dismissal reaches the merge. A merged PR still
  collects reviews: re-fetch it once after the merge, because a finding
  posted while it was being merged exists in the API and in no report. The
  same holds before it: the bot's review lands on its own schedule and can
  arrive after a local pass has already reported, so treat
  `Actionable comments posted: N` as what one review posted inline rather than
  what the pull request holds — a second review, and a collapsed out-of-grid
  section, are each counted separately. A pull request gets fixes for at most
  three rounds, a round being CodeRabbit's review of one commit: count the
  distinct commits that the pull request's reviews by a `coderabbitai` login
  name, never the App's `laidrivm-harness-agent[bot]`, so a session with no
  memory of the earlier rounds reaches the same count. A fourth round or later
  whose review carries a finding the run would apply gets none applied: the
  run ends on `CODERABBIT gate: BLOCKED` naming the cap and reports each
  finding left with its severity, file and line, because churn past three
  rounds is a signal to talk (unattended: card — hand the findings left on as
  one question on the card, which waits behind one already open there as
  `task-board` sets out; the run posts nothing in the pull request). A
  fourth round with only findings skipped with a reason is not capped.
- `/coderabbit-local [base]` — CodeRabbit's CLI review of the working
  branch, run when the user asks for CodeRabbit's take before a push. It is
  available and in no sequence and no gate: `/code-review` replaced it as the
  local review on 2026-10-27, having flagged 18 defects the CLI missed
  against 1 over five measured pull requests, and the CLI draws on the
  allowance CodeRabbit's review on the pull request needs. The CLI looks for
  `.coderabbit.yaml` on its own only while no `--config` is given, and the
  skill always gives one. So the skill passes the config explicitly, together
  with the guideline files that the config's `code_guidelines` patterns match.
  A CLI review that skips them is a differently aligned reviewer, not a
  cheaper one.

## The pre-PR sequence

Before every PR — a feature, a bugfix, a chore, a proposal alike, and
whether or not it goes through the OpenSpec stages. Completing a task group
starts the sequence in the same turn, and `bun/turn-gate.ts` refuses a turn
that commits a group's last task and ends without the gate lines and the
runner's record of the commit it ends on, or a `BLOCKED` naming what only the
user can settle. What it does not see: a pull request that changes code
outside a task group starts the sequence too. A `/goal` run that reaches its
round ceiling ends without the refusal, since refusing would only continue
it. The runner's records prove that the diff budget and the project checks
ran at that commit; the other steps' gate lines report them. In the
harness's own sessions a hook records each skill call at the commit its
directory holds, with no tracked file changed (`gate-ledger`, *Each skill
call is recorded for the commit its directory holds*): that proves the skill
was called, not that the step was followed. Elsewhere nothing proves they ran.

Which of the steps below a branch requires is not the agent's call: the
runner's last line, `PRE-PR steps: <id>, <id>, …`, names them by the skill
each runs, from the branch's diff against the base the budget measured and
from its pull request's state, as `pre-pr-runner` (*The runner names the
steps the branch requires from its diff*) sets out. Once a pull request is
open, draft or not, it names the project checks alone: that is the least a
push into it requires, and step 5 says what still runs before one. The steps
below say why each one exists.

1. The diff budget first, looked at with `bash bun/diff-budget.sh` (`bash
   node_modules/harness/bun/diff-budget.sh` where the harness is installed),
   which records nothing. Then the runner, `bun bun/pre-pr.ts` (`bun
   node_modules/harness/bun/pre-pr.ts`), once, after the sequence's last
   commit, since its records name the commit it read. It runs the diff budget,
   then the project checks — the command under `harness.bumpTest` — and
   records each; give the call a 600000 ms timeout or run it in the
   background, since the full test run takes minutes. The pre-push hook and
   CI measure the budget without recording. The budget goes first because
   over budget says the reviewable unit was cut too wide rather than that the
   code is wrong — and re-cutting it changes the diff every gate below reads.
   It reports how many lines the reviewer must read, and names its own
   thresholds and, where it has one, the remedy in the gate line, so a reader
   never looks either up here. A gate that reports it could not measure is
   neither over budget nor within it: it means the base is unresolvable, and
   in CI it fails the check rather than passing unmeasured.
2. `/zombies` with **no arguments** — diff mode reads the real code and
   existing tests, cross-checks the implementation against the
   proposal-stage edge-case list, and catches the edges only implementation
   decisions create. Fix what it finds.
3. `/warm`, when the runner names it, since a new or upgraded dependency is
   code nobody on the branch wrote, having walked the ponytail ladder before
   ever reaching for a dependency.
4. `/triage`, over the final diff, so it maps the diff the reviewer
   will actually see.
5. `/code-review` last, as `/code-review high <base>` on the terms the
   `/code-review` bullet sets out, then push — only while no pull request is
   open on the branch, a draft counting as open: a push into an open one
   skips it while the earlier steps run, and its report says CodeRabbit
   reviews the head on the pull request, a draft's once it is marked ready,
   where `/coderabbit` disposes of the findings; a state the read could not
   get runs it, and the report says the state was unread.

CI measures the budget on every pull request and the pre-push hook measures it
last of all, once every gate that can refuse the push has passed. Neither is
the first reading: a count that arrives with the push arrives after the step
it would have told you to re-cut, and a branch never pushed is a branch never
measured.

A documentation branch, as the runner classifies one, gets one pass of
`/code-review high <base>` — one, not three — on the terms the
`/code-review` bullet sets out. That pass, too, runs only while no pull
request is open on the branch, a draft counting as open: a push
into an open one skips it while the earlier steps run, and its report says
CodeRabbit reviews the head on the pull request; a state the read could not
get runs it, and the report says the state was unread.

Your sequence ends there — the PR link is the deliverable. `/coderabbit`
closes the loop on the pull request, once the bot has reviewed the head
commit.
