# name-the-agent-bot

## Why

Two review-doc statements are out of step with the harness. The App that
`github-app-identity` sets up gives the loop's agents a GitHub identity of
their own. But `core/git-and-prs.md`'s rule against writing under the
user's name never names that bot, so it can be read as forbidding the bot
as well.

The `ship` skill capped a pull request's bot review at three round trips.
`remove-ship` deleted the skill and left the cap to the card *Update the
review docs once a review's arrival starts an agent*, so nothing caps those
rounds today.

## What Changes

- **The bot is named.** `core/git-and-prs.md`'s bullet on sending,
  replying, commenting and reviewing under the user's name keeps its
  substance. It adds that the harness's GitHub App, `laidrivm-harness-agent`,
  writes as itself and shows as `laidrivm-harness-agent[bot]`. It writes only
  from the board loop's runner or the orchestrator, never from inside a
  session.
- **The round cap moves into the policy.** `core/review-toolkit.md`'s
  `/coderabbit` bullet caps a pull request at three rounds of CodeRabbit's
  review. The bullet says what a run does when it reaches a fourth review that
  still carries a finding to apply. Attended, it applies nothing, reports the
  findings and stops. Unattended, it hands them on as a question on the card,
  and posts nothing in the pull request.
- **A test pins both docs.** A new `bun/review-docs.test.ts` reads the two
  bullets. It also checks that no tracked file under `bun/` spells the App's
  name, since the runner reads the name from GitHub.

## Non-goals

- The `/coderabbit` line saying it is started by CodeRabbit's
  `Review completed` status. That waits for the orchestrator's next slice and
  stays on the card.
- Any bot comment in a pull request. The user decided on 2026-10-18 that a
  Major or Critical dismissal without the user goes to the card as a question
  only, never as a bot comment. This change keeps that.
- `core/skills/coderabbit/SKILL.md`. Its step 5 already defers to the
  project's review policy, so the cap reaches a run through
  `review-toolkit.md` (design.md, D3).
- The App's code (`github-app-identity` step 2), the tracked `deny` entries
  and the command guard's `gh` writes. None of them changes.

## User acts

- Merge this proposal's pull request, and later the implementation's.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `agent-permissions`: an added requirement, *The rule against writing under
  the user's name names the App's bot*.
- `agent-autonomy`: an added requirement, *A pull request gets CodeRabbit's
  fixes for at most three rounds*.

## Impact

- Edited: `core/git-and-prs.md`, `core/review-toolkit.md`.
- New: `bun/review-docs.test.ts`.
- No code under `bun/` other than the test, no dependency, no permission
  entry. Consumers pick the two docs up with their next pin move. d2ass reads
  both docs from the harness.
