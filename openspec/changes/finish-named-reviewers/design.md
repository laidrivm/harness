# finish-named-reviewers — design

## Context

`bun/work-finish.ts` decides whether to wait with
`watched = tracked(top).paths.includes(".coderabbit.yaml")`, after the push
and the opening. The waits, the state reading (`bun/coderabbit-run.ts`:
`own`, `state`, `REVIEWED`) and the request (`request()`) are CodeRabbit's.
`request()` runs only when the 18 reads after the ready switch end on
`skipped`; its once-per-head guard counts a comment as made for this head when
it was posted at or after `arrived(runs)`, the earliest `started_at` of the
head's CodeRabbit runs, which is `-Infinity` when the head has none.

`bun/config.ts`'s `read(root, key)` fails on an absent key by design: a
default would make a forgotten value read as a decision. The user chose the
opposite for this key (answer 2 b, 2026-11-03): no key, the harness runs with
no external reviewers.

Evidence the card gathered (explore, 2026-11-02): mellon is reviewed by
CodeRabbit with no `.coderabbit.yaml`; on #361 the heads `d7e9422` and
`7c5170e` held no CodeRabbit run after the ready switch, the harness's
`auto_pause_after_reviewed_commits` being `0` since 29.10 (`e97aa784`), so the
cause is unknown. Read for this proposal: mellon's last pull request, #47
(2026-10-13), carries CodeRabbit's verdict as a commit status (`context:
CodeRabbit`, `Review completed`), not a check run; the harness's own moved to
a check run on 2026-10-27.

## Goals / Non-Goals

**Goals:** the project, not a settings file, says which reviewer `finish`
waits for; a head left with no run gets the same one request as a skipped
head, at most once.

**Non-Goals:**

- Reading another bot's check run. None is named today, and what a skip or a
  limit means for it cannot be known in advance (card point 2).
- Reading a commit status. The harness reads check runs (`finish-review-arrives`,
  *One module reads the check runs*); mellon's status is a risk below, not a
  second reader.
- CodeRabbit's pause state, which only its summary comment's text carries;
  `finish-review-arrives` decided not to read comment text, and the request on
  no run covers a paused head anyway.

## Decisions

### 1. The key lives in `package.json` under `"harness"`, read by `bun/config.ts`

`reviewers: string[]` joins `Config`. A new `reviewers(root)` in
`bun/config.ts` returns `[]` for an absent file or key and the list otherwise,
and throws naming the file or `harness.reviewers` for a file that does not
parse, a value that is not an array of strings, or a name other than
`CodeRabbit`. The JSON parse and its error are lifted out of `read()` into one
function both call, so the two readers cannot drift. `config.ts`'s header
comment, which says an absent key fails, names this key as the one exception
and the user's answer as its reason.

*Alternatives:* `read()` with a catch in `finish` — a catch cannot tell an
absent key from a broken file, and would turn the second into "no reviewer";
a separate settings file — the harness keeps every project value in one place
(`README.md`, *Consuming*, step 3).

### 2. The read and its refusal sit before the push

`finish` reads `reviewers(top)` among its refusals, after the branch checks
and before the push, recording a `finish` block with id `reviewers` as every
refusal does. A typo or a name `finish` does not know then costs no push, no
opening and no wait. `watched` becomes `names.includes("CodeRabbit")`, and the
`tracked()` call after the push goes with its "tracked files could not be
listed" branch and that branch's test. With no reviewer named, `finish` prints
`finish: harness.reviewers names no reviewer, so none was waited for` — the
same kind of line as the no-`--card` one — so a consumer that forgot the key
sees it on every run.

*Alternative:* ignore an unknown name — it would read as a reviewer waited for
when none was.

### 3. The request covers no run through the same `request()`

The reads after the ready switch end on `skipped` or no run; both go to
`request()`, which now takes the state it ended on. The read right before the
post must still give `skipped` or no run — a run that appeared in between
ends on its own state with nothing posted, as today. The line keeps its
shape, its prefix naming the state: `no CodeRabbit run on <short> after 18
reads; asked for a review`, or `; a review was already asked for`, or `; the
request failed, …`. The read budget stays 18: a review usually starts 25–35 s
after the ready switch, and on `d7e9422` none came for 17 minutes.

### 4. With no run, "once per head" counts from the committer date

`arrived(runs, committed)` returns the earliest start of the head's CodeRabbit
runs, else `committed`: `HEAD`'s committer date, read locally with
`git show -s --format=%ct HEAD`, in ms; a date that does not parse gives
`-Infinity`, so every exact request counts and nothing is posted twice.

The committer date, not the author date: a rebase, an amend or a cherry-pick
makes a new head and resets the committer date, while the author date stays
at the first write. Not the push time: neither git nor the check-runs read
gives it, and `finish` knows it only for its own push, which a rerun lacks.

This fails closed for an old commit pushed late: a request for an earlier head
posted after `HEAD` was committed reads as one for `HEAD`, and `finish` posts
nothing and says a review was already asked for (card point 3).

### 5. Consumers add the key at or before the bump

The harness's `package.json` gets `"reviewers": ["CodeRabbit"]` in the same
change. A consumer's harness ignores keys it does not read (`config.ts` reads
named keys, `bump-pin.ts` only the dependency), so d2ass and mellon can add
the key before their daily bump crosses this change; without it they stop
waiting, silently but for the line of decision 2. `README.md` (*Consuming*,
steps 3 and 7) and `core/git-and-prs.md` say so.

## Risks / Trade-offs

- [mellon's CodeRabbit may still post a commit status, not a check run] →
  `finish` there would wait 12 reads before the ready switch, read no run for
  18 after it, and post a request on every head. Task 5.1's mellon card reads
  the head of mellon's next pull request before the key goes in; on a status,
  mellon leaves the key out and a card covers statuses.
- [Why CodeRabbit left two heads of #361 without a run is unknown] → the
  request covers the case whatever its cause; a cause that also ignores the
  request shows as `asked for a review` with no review, which the `coderabbit`
  skill's step 1 already reports.
- [The committer date comes from the committing machine's clock] → a clock
  ahead of GitHub's by more than the gap between the commit and a request makes
  that request read as older, and a rerun posts a second one; one extra comment
  at most per rerun, and only on a head with no run.
- [A late-pushed old commit gets no request] → the line says a review was
  already asked for; the user asks by hand, as before this change.
- [A forgotten key silently stops the wait] → the user's chosen trade-off
  (answer 2 b); the line of decision 2 and the docs at the bump are the
  mitigation.
- [The request on no run spends the user's standing permission on a head
  CodeRabbit was only slow on] → CodeRabbit answers with one more comment and
  no second review (the user's answer 1 a weighed this).

## Migration Plan

One pull request carries the code, the tests, the harness's own key and the
docs; the harness's own sessions run `finish` from the tree, so the key and
the code take effect together. Rollback is a revert. Consumers: add the key,
then let the bump land.
