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
- `/coderabbit-local [base]` — the same review against the working branch,
  before there is a PR. Invoke it yourself. It runs only while no pull
  request is open on the branch, a draft counting as open: a push into an
  open one skips it while the earlier steps run, because CodeRabbit reviews
  that head on the pull request and `/coderabbit` disposes of its findings.
  Read the pull request's state before the sequence starts, as
  `git-and-prs.md` has it read before a review pass, and never infer it from
  what the push carries. A branch whose only pull request was closed unmerged
  has none open and runs it again, and a state the read could not get runs
  it, since a skipped review is the costlier mistake. A finding that survives
  verification is applied without asking, whatever its severity, overriding the
  skill's own "No fixes before approval" — the branch is unpushed, so being
  wrong costs a `git checkout`. Dismissing a 🟠 Major or 🔴 Critical goes the
  other way: it is put to the user with what the bot missed, and the gate line
  reads `OPEN` until they settle it, because a wrong dismissal reaches the
  merge where a wrong fix does not (unattended: card — hand it on with what
  the bot missed, and list it in the pull request's body as `autonomy.md`'s
  `agent` sets out). At most three reviews with fixes between them; stop
  early the moment a review returns nothing above 🟡 Minor, and if Major or
  above survives the third, report it and stop rather than starting a fourth
  (unattended: agent — push and open the pull request, listing the finding
  as still open; under the board loop, name the pull request with that
  listing in its body, and the runner opens it).
  Collect Minor findings across all passes and report them once at the end,
  each fixed or skipped with its reason. The CLI looks for
  `.coderabbit.yaml` on its own only while no `--config` is given, and the
  skill always gives one. So the skill passes the config explicitly, together
  with the guideline files that the config's `code_guidelines` patterns match.
  A local review that skips them is a differently aligned reviewer, not a
  cheaper one.
- `/coderabbit [pr]` — chews the bot's PR comments. Run it once the bot has
  reviewed the head commit, never to wait for that, because the bot's
  review arrives on its own schedule and waiting for it burns a session doing
  nothing — the cost is the wait, which a synchronous CLI review does not
  have, and that is the whole difference between this bullet and the one above
  it. A run that finds no review of the head commit ends `OPEN` after one
  read. Once a PR is open, say so and stop —
  do not poll the checks, do not sleep on a timer, do not re-run `gh` to see
  whether the bot has posted. Once the review has landed, dispose of the
  findings on the same terms as `/coderabbit-local`: any verified finding
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
- `/code-review` — Claude's own review, measured beside `/coderabbit-local`
  until the user decides whether it replaces the CLI (the reviewer-rotation
  card's step 2). While fewer than ten pull requests are measured, a branch
  that runs `/coderabbit-local` also runs `/code-review high` in a fresh
  subagent at the commit of the CLI's first pass: the same commit makes the
  two lists comparable, a fresh subagent reviews code its context did not
  write, and the level is named because `/code-review` with none reuses the
  last one typed. The verified findings of both are applied on the
  `/coderabbit-local` terms above, since the branch ships either way. It is
  no gate and carries no severity while measured: a finding of it judged
  wrong or not worth fixing is skipped with its reason in the report, and the
  gate line stays as `/coderabbit-local` set it. The pull request opens with
  a section under a line reading `## Review measurement`: one line per
  verified defect, giving its file and line, what it was and which reviewer
  flagged it (CLI, `/code-review`, both), or the single line `none` when
  neither flagged one. A run that does not return — a usage limit, an error,
  a subagent that ends without a review — leaves no section and is not
  counted, and the report names why.
  `gh pr list --repo <repo> --state all --search '"Review measurement"
  in:body' --json number,body --limit 1000` lists the candidates, closed and
  merged ones included; only a body with a line exactly `## Review
  measurement` counts as measured, since the search also matches a body that
  merely names the phrase. The tally goes to the user once CodeRabbit has
  reviewed the fifth measured pull request: the session that disposes of that
  review files an `idea` card on the Harness board with, for each measured
  pull request, the defects only the CLI flagged, only `/code-review`
  flagged, both flagged, and what CodeRabbit then raised and the agent
  applied (a subagent without Notion access names the card in its report,
  and its caller files it). The measurement ends at the tenth: after it,
  `/coderabbit-local` runs alone and the body carries no section.
  `/ponytail-review`'s record is no evidence about it: that plugin was tuned
  to shape, not defects, and the code it read was written under the same
  plugin.

## The pre-PR sequence

Before every PR that changes code — a feature, a bugfix, a chore alike, and
whether or not it goes through the OpenSpec stages. Completing a task group
starts the sequence in the same turn, and `bun/turn-gate.ts` refuses a turn
that commits a group's last task and ends without the gate lines and the
runner's record of the commit it ends on, or a `BLOCKED` naming what only the
user can settle. What it does not see: a pull request that changes code
outside a task group starts the sequence too. A `/goal` run that reaches its
round ceiling ends without the refusal, since refusing would only continue
it. The record proves that step 1 ran at that commit; the other steps' gate
lines report them, and nothing proves they ran.

1. The runner, `bun bun/pre-pr.ts` (`bun node_modules/harness/bun/pre-pr.ts`
   where the harness is installed), first, and again after the sequence's last
   commit, since its record names the commit it read. It runs the diff budget
   and records the run; the pre-push hook and CI measure the budget without
   recording. The budget goes first because over budget says the reviewable
   unit was cut too wide rather than that the code is wrong — and re-cutting it
   changes the diff every gate below reads. It reports how many lines the
   reviewer must read, and names its own thresholds and, where it has one, the
   remedy in the gate line, so a reader never looks either up here. A gate
   that reports it could not measure is neither over budget nor within it: it
   means the base is unresolvable, and in CI it fails the check rather than
   passing unmeasured.
2. `/zombies` with **no arguments** — diff mode reads the real code and
   existing tests, cross-checks the implementation against the
   proposal-stage edge-case list, and catches the edges only implementation
   decisions create. Fix what it finds.
3. `/warm`, only when a dependency manifest changed, having walked the
   ponytail ladder before ever reaching for a dependency.
4. `/triage`, over the final diff, so it maps the diff the reviewer
   will actually see.
5. `/coderabbit-local` last, then push — only while no pull request is open
   on the branch, a draft counting as open: a push into an open one skips it
   while the earlier steps run, and its report says CodeRabbit reviews the
   head on the pull request, where `/coderabbit` disposes of the findings;
   a state the read could not get runs it. Beside it runs the measurement
   the `/code-review` bullet sets out.

CI measures the budget on every pull request and the pre-push hook measures it
last of all, once every gate that can refuse the push has passed. Neither is
the first reading: a count that arrives with the push arrives after the step
it would have told you to re-cut, and a branch never pushed is a branch never
measured.

A branch of documentation, rules or config runs step 1, then `/triage` alone,
plus a grep for every site restating what it changes, plus `bun test` when it
adds or removes a directory under `openspec/changes/` — a test pins the tree's
change set — then one pass of `/coderabbit-local` — one, not three — with
the measurement the `/code-review` bullet sets out. That pass, too, runs only
while no pull request is open on the branch, a draft counting as open: a push
into an open one skips it while the earlier steps run, and a state the read
could not get runs it.

Your sequence ends there — the PR link is the deliverable. `/coderabbit`
closes the loop on either, once the bot has reviewed the head commit.
