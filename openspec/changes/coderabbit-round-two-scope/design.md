# coderabbit-round-two-scope — design

## Context

`core/review-toolkit.md`'s `/coderabbit` bullet disposes of CodeRabbit's
findings on `/code-review`'s finding-disposal terms and caps fixes at three
rounds, a round being CodeRabbit's review of one distinct commit. The
`coderabbit` skill's step 5 already yields to a project's review policy on
when fixes are applied. Its rules on severity forbid a skip by label, so an
agent following the skill fixes a Minor that the project wants deferred.
`.coderabbit.yaml` sets no `path_instructions`, `path_filters` or `profile`.
`bun/review-config.test.ts` pins the keys it does set, reading them through
`parsed()` and `at()` in `bun/review-config.ts`.

## Goals / Non-Goals

**Goals:** fewer CodeRabbit rounds on a pull request's wording, with every
Major still verified and every finding still dispositioned.

**Non-Goals:** a gate that refuses a push; any change to `resolve`, `finish`
or the three-round cap; draft reviews, which stay off; `reviews.profile`,
which acts on the whole repository and cannot be set per path.

## Decisions

### Where the line falls

The rule names what is pushed and defers the rest. Major and above are
pushed anywhere, and so are Minors in the living docs:

- `openspec/specs/**`;
- `CLAUDE.md`;
- `core/**`.

Every other Minor is deferred: everything under `openspec/changes/**`, a
change's delta specs included, code, `README.md`, `.coderabbit.yaml`, and a
consumer's own docs. The user's answer named `openspec/specs/**`, `core/`,
the change's artefacts and code, and the user added `CLAUDE.md` on 2026-11-02,
since every session loads it. A delta spec stays on the deferred side by the
same decision: a Minor deferred there may come back on the archive pull
request, once the text is synced into `openspec/specs/**`. A consumer's `harness/*.md`
is a copy that sync writes, and a rule is edited in the harness, never in the
copy (`README.md`, step 4). So a Minor there is deferred, to a card on the
harness's board, the repository that would ship the fix. Naming the pushed side leaves no path
unclassified. `core/**` takes in `core/skills/**`, which consumers install.
The synced specs an archive pull request writes are living specs, so their
Minors are still pushed, as on #390 and #392.

A Minor's round is the position of the commit named by the review that
posted it, never the count when the run starts. Commits are ordered by
their first CodeRabbit review. A first-round Minor still undisposed when a
second commit has been reviewed, for example after a merge of `origin/main`,
is therefore still read as a first-round one. A finding that a later full
review posts again, on the same path and asking the same, keeps the round
of its first posting and is disposed of once. The three-round cap still decides whether the run applies
anything. A Minor already on the tail card, whose thread is still open in a
later run, is listed again as deferred and not written again. A fourth
round holding only deferrals needs no sentence of its own: a deferral is a
skip with a reason, which the cap already leaves alone.

Rejected: deferring every Minor from the second round (option c on the
card), which the user declined for now. Rejected: deferring only code
Minors, which on the seven pull requests would have saved no round. Code
Minors are deferred because the user chose that (answer 1 b), not because
the round table shows a saving.

### The tail card

There is one card per pull request, named `CodeRabbit Minors deferred from
#<N>`, filed on the repository's board at `idea` by the first run that
defers. A later run looks the name up on the board before filing, so a
session with no memory of the earlier rounds adds to the same card. Each
entry gives the finding's path, line, severity and what it asks. The card
is filed whether the session is attended or not, since a deferral asks the
user nothing. Rejected: a link in the pull request's body. Each round would
need a `gh pr edit`, and the card would still have to be filed on the board,
where the name alone already finds it.

### The skill's sentence

Step 5 gains one sentence of its own, after the override paragraph and not
inside its condition, so it holds whether or not the project's policy also
applies fixes without asking. It says that a project's review policy may
defer a finding to a card by its severity, path and round, and that such a
finding is listed under Skipped as `deferred to <card>` and counted in the
arithmetic. The rule *Severity budgets attention, not belief* gains a clause
that a skip may also be a deferral the project's policy makes. Step 3's
opening paragraph and its Minor line both have such a deferral as the
exception to "a correct, cheap Minor gets fixed" and to "'it is only Minor'
is not a reason". Under the skill's own default,
`below severity threshold` stays no reason. A Major deferred by a policy is a
dismissal, and the skill already puts that to the user. Rejected: a
harness-only exception in the toolkit with the skill unchanged. The skill
would still tell the agent to fix the Minor, and the skill is what the agent
reads at the step.

### `path_instructions`, not `path_filters`

One entry, `path: "openspec/changes/**"`, with instructions along these
lines: "A working artefact of an OpenSpec change, headed for the archive.
Flag contradictions with a spec, the code or another artefact. Do not flag
wording, duplication or style." The test asserts the path and three
phrases, with whitespace normalised: `archive`, `contradictions with a spec,
the code or another artefact`, and `Do not flag wording, duplication or
style`. The entry covers the whole of `openspec/changes/**`, delta specs
included, as the user decided on 2026-11-02. The entry is meant to drop wording findings at every severity, the Majors that
drove #329 and #347's last round included; what it keeps is the
contradictions. Rejected: `path_filters: ["!openspec/changes/**"]`. It would
have lost every finding there, contradictions included: the `started_at`
Major on #342, which the instruction keeps, as well as the other Majors on
#342, #346 and #347. It would also have left a proposal pull request with
nothing to review. Rejected:
`openspec/changes/archive/**` alone, where the seven pull requests had no
finding at all.

### No gate

The round is countable from the reviews, but neither `finish` nor `resolve`
knows which finding a commit fixes. Refusing a push in the second round
that touches a file holding only open Minors would also refuse a Major's fix
there ("fix the cause, not the line"). That blocks more than the rule asks.
The tests pin the wording; the round table checks the effect.

## Risks / Trade-offs

- [The bot reads the instruction more widely and drops a real contradiction]
  → Majors stay verified, the round table is re-measured, and one edit to
  the config removes the entry.
- [The instruction changes nothing, since the docs promise no severity
  effect] → the rule in the toolkit still saves the Minor-only rounds;
  the measurement says whether the entry earns its place.
- [A deferred Minor's thread holds the bot's approval back] → the report
  names the thread for the user to resolve, and the card holds the fix.
- [A real Minor defect in shipped code waits on the tail card] → it is the
  cost the user accepted with answer 1 b. The card's pull request is
  reviewed afresh, and the round table shows whether the code half of the
  rule earns its place.
- [The gate line reads `PASS` while a deferred thread holds the approval
  back] → a Minor skipped with a reason does the same today. The report
  names each deferred thread above the gate line.
