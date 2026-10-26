# local-review-before-pr

## Why

The pre-PR sequence runs `/coderabbit-local` before every push, a fix push
into an open pull request included, so the CLI reviews a commit the bot on the
pull request then reviews again. Both draw on one CodeRabbit allowance: over
the seven days to 2026-10-25 `laidrivm/harness` took at least 207 bot reviews
on 106 pull requests, about 100 of them repeat rounds each preceded by a local
run, and the allowance fell to one review an hour (card *Поменять
агента-ревьюера с одного coderabbit на ротацию нескольких*). The user chose
path а on 2026-10-26: step 1 now, step 2 — Claude's `/code-review` as the
local reviewer — only after a measurement on five to ten real pull requests,
step 3 — CodeRabbit stays on the pull request, its usage cap the user's own
billing setting.

## What Changes

- Step 1: `/coderabbit-local` runs only while the branch has no open pull
  request. A push into an open one, draft or ready, gets no local review —
  CodeRabbit reviews that head and `/coderabbit` disposes of its findings.
  The other steps of the sequence still run on that push. This is stage 2's
  answer 24 а′, judged by the pull request's state, not by why the push is
  made.
- Step 2, measurement only: until the user settles step 2, a branch that
  runs `/coderabbit-local` before its pull request opens also runs
  `/code-review high` in a fresh subagent at the same commit, and the pull
  request's body records which defects each local reviewer flagged. Once
  CodeRabbit has reviewed the fifth measured pull request, a session files a
  card with the tally for the user, and at the tenth the measurement stops. `/code-review` is no gate
  while it is measured.
- `core/review-toolkit.md` carries both: the sequence's step 5 and its
  documentation-branch path, and a `/code-review` bullet that holds the
  measurement procedure and says why `/ponytail-review`'s record is no
  evidence about it.

Out of scope: replacing `/coderabbit-local` (step 2 itself, a later change
once the user decides on the tally), the `--json-schema` severity form that
change will use, the CodeRabbit usage cap (the user's billing setting), and
any reviewer abstraction (the card's decision 5).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `local-review-loop`: *The gate runs after triage and before the push* runs
  the gate only while no pull request is open on the branch; a new
  requirement fixes how `/code-review` is measured beside it.

## Impact

- `core/review-toolkit.md`: the `/coderabbit-local` bullet, a new
  `/code-review` bullet, step 5 of *The pre-PR sequence* and its
  documentation-branch paragraph.
- `bun/review-docs.test.ts`: cases pinning the open-pull-request condition
  and the measurement's procedure in that doc.
- No code path changes: no harness script runs `/coderabbit-local` or reads
  its gate line to decide a push.
