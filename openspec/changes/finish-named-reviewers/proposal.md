# finish-named-reviewers

## Why

`finish` waits for CodeRabbit's run on the head only where the checkout tracks
`.coderabbit.yaml`, and that file is the bot's settings, not a sign a reviewer
is attached: mellon is reviewed by CodeRabbit without one, so `finish` there
neither waits nor notices a skip; a repository holding the file with no app
installed waits about 150 s for nothing; and a reviewer rotated in has no such
file (the user's words, 2026-11-01, on #361's question 8). On #361 two heads,
`d7e9422` and `7c5170e`, got no CodeRabbit run at all after the ready switch:
`finish` printed «no CodeRabbit run … after 18 reads» and asked for nothing,
since its request fires only on `skipped`; the first was reviewed only after
the user asked by hand 17 minutes later, the second merged unreviewed (card
*Let finish wait for the reviewers the project names in harness.reviewers, by
check-run name*, 40b39875c31b814b8dade5be8635c7b7).

## What Changes

- **BREAKING** for consumers: `finish` waits for a reviewer only when the
  project names it in `package.json` under `"harness": { "reviewers": [...] }`,
  by check-run name. The `.coderabbit.yaml` condition goes. With no key, or an
  empty list, `finish` waits for no reviewer and asks for none — the harness
  runs without external reviewers (the user's answer 2 b, 2026-11-03). A
  consumer reviewed by CodeRabbit that does not add the key silently stops
  waiting once its pin moves past this change.
- `CodeRabbit` is the only name understood. A list naming anything else, or a
  value that is not a list of strings, makes `finish` refuse before the push,
  naming the value. The state reading stays CodeRabbit's (`bun/coderabbit-run.ts`,
  `REVIEWED`); no other bot's run is generalised to.
- When the 18 reads after the ready switch end on no run, `finish` posts the
  same one `@coderabbitai review` it posts on `skipped`, once per head (the
  user's answer 1 a, 2026-11-03). "Once per head" counts from the earlier of
  the head commit's committer date and the start of its first CodeRabbit run:
  a request at or after it counts as made, so a rerun does not post twice even
  when a run starts after the request, and an old commit pushed late behind an
  earlier head's request posts nothing and says a review was already asked
  for.
- The harness's own `package.json` gets `"reviewers": ["CodeRabbit"]`.
- `README.md` and `core/git-and-prs.md` say a consumer whose CodeRabbit posts
  a check run adds the key — before the bump that crosses this change, since an older
  harness ignores it — and that the standing permission for the one comment
  covers a head left without a run; `core/review-toolkit.md` and
  `core/rules.md`'s line naming that comment follow.

Not in this change: a second reviewer's states, since none posts a check run
on these pull requests today (the reviewer-rotation card,
3fe39875c31b801a9422e928cde62eb0); reading CodeRabbit's pause state, which
lives only in its summary comment's text; the bot's settings in
`.coderabbit.yaml` and `bun/review-config.ts`, which stay.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `work-finish`: *Finish lets CodeRabbit see the push before the ready switch*
  and *Finish ends on CodeRabbit's state of the head* take their condition from
  `harness.reviewers`; a new requirement refuses a reviewers value `finish`
  cannot act on; *Finish asks once for the review of a skipped head* covers a
  head with no run, counted from the earlier of the committer date and the
  first run's start.

## Impact

- Changed: `bun/work-finish.ts` (the condition, a refusal before the push, the
  request on no run), `bun/coderabbit-run.ts` (`arrived()` takes the earlier
  of the committer date and the first run's start), `bun/config.ts` (`reviewers` in `Config`, read where absent
  means none), `bun/work-finish.fixture.ts`, `bun/work-finish-review*.test.ts`,
  `bun/config.test.ts`, `package.json`, `README.md`, `core/git-and-prs.md`,
  `core/review-toolkit.md`, `core/rules.md`.
- Consumers: d2ass adds `"reviewers": ["CodeRabbit"]` under `"harness"`, at
  or before the pin bump past this change. mellon's CodeRabbit reported a
  commit status, not a check run, on its last pull request (#47, 2026-10-13);
  with the key and a status, `finish` there would read no run and ask for
  reviews it did not need, so mellon adds the key only once a probe finds a
  check run on its head, and otherwise leaves it out (`design.md`, decision 5
  and *Risks*; task 5.1).
