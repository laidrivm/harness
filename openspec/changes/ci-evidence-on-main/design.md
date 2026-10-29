# ci-evidence-on-main — design

## Context

Read with `gh api` on 29 October: no classic branch protection
(`branches/main/protection` is 404); one ruleset, `main` (id 25440192,
active, `~DEFAULT_BRANCH`), with deletion and non-fast-forward rules and a
`pull_request` rule — one approval, `dismiss_stale_reviews_on_push: false`,
`required_review_thread_resolution: false`. Its one bypass actor is the
Admin role, `always`. No status check is required. Every pull request runs
`test` (`test.yml`) and `budget` (`diff-budget.yml`); CodeRabbit reports on
the head as a check run named `CodeRabbit`.

The card's exploration and the user's answers of 29 October settle the
shape; this design records the decisions and what they touch.

## Decisions

1. **The existing ruleset, not a second one** (answer 1 б). A bypass lifts
   every rule of its own ruleset, so `test` added to `main` is bypassed by
   the same click that bypasses the approval. That is the point: the user
   keeps the bypass, and an agent identity — the GitHub App on the VPS, and
   perhaps later a local one — has none, so the rule binds exactly the
   merger it is for.
2. **Source GitHub Actions** (answer 2 а). With *any source*, a commit
   status named `test`, which a user token can set, would satisfy the check.
3. **`budget` is required too** (answer 3 б). A pull request over 800 lines
   still merges, but only with `oversize: <reason>` in its body, which
   `bun/diff-budget.sh` reads and turns into `OVERRIDE` and exit 0; an agent
   cannot merge one silently.
4. **Automatic Approvals instead of a required `CodeRabbit` check**
   (answer 4). A required check passes on `skipped` and `neutral`, which is
   where no review happened. An approval comes only when the latest commit
   has a completed review, every required thread is resolved and no
   pre-merge check fails, and it counts toward the ruleset's one approval
   (CodeRabbit's docs, *Automatic approvals*). The card named the key
   `reviews.request_changes_workflow`; CodeRabbit's schema (`schema.v2.json`,
   read 29 October) marks that key a deprecated, undocumented legacy alias
   of `reviews.auto_approvals.enabled`, so the config sets the current key —
   the same switch.
5. **Draft reviews stay off.** `reviews.auto_review.drafts` is not set (the
   user's standing decision): a draft is pushed to while its work goes on,
   and the bot reviews it once it is marked ready.
6. **The pin is a test over the repository's config, with no fixture
   tree.** It reads `.coderabbit.yaml` through the parse and key walk
   `bun/review-config.ts` already used for `filePatterns`, lifted into two
   exported helpers (`parsed`, `at`) so the file is read and parsed in one
   place, and expects `reviews.auto_approvals.enabled` to be `true`,
   `reviews.auto_review.drafts` not to be, and the legacy alias
   `reviews.request_changes_workflow` to be absent, so one key holds the
   switch. An absent key reads `undefined` and fails the first; a config
   that does not parse fails the case with the helper's message. The parser
   is YAML's, not CodeRabbit's own; where the two would differ is not
   probed.
7. **Reviews never pause.** `reviews.auto_review.auto_pause_after_reviewed_commits`
   defaults to five in CodeRabbit's schema; past it the bot reviews no new
   head until someone posts `@coderabbitai review`, so no approval comes
   (and, with stale approvals kept, an earlier head's still counts). The
   config sets it to `0` (CodeRabbit's review of #347). The cost is a review
   on every push of a long pull request, against the bot's rate limit.
8. **Strict stays off** (assumption 5): the rule to merge `origin/main`
   before pushing already holds, and strict would add rounds of CI and
   review.

## Risks

- **A stale approval.** With `dismiss_stale_reviews_on_push: false`, the
  bot's approval of an earlier head still counts after a push, until the
  bot reviews the new head — and a push into a draft is reviewed only once
  the pull request is marked ready. The user's task therefore requires
  *Dismiss stale pull request approvals when new commits are pushed* in the
  same edit (CodeRabbit's review of #347; the user turned it on on 29
  October); with it, every push waits for the bot's review of its head.
- **An author's own approval.** `reviews.auto_approvals.allow_author_approval`
  defaults to `true`: a pull request's author may comment
  `@coderabbitai resolve` or `@coderabbitai approve`, and with Automatic
  Approvals on that approves without a completed review of the latest
  commit. An agent identity that authors a pull request could approve its
  own that way. No session posts to a pull request (the `gh` writes stay
  refused, and the App writes only from the runner or the orchestrator), so
  the threat is not seen, and setting it `false` would take the command
  from the user on the pull requests they author. Left at its default;
  `core/git-and-prs.md` says no agent posts either command.
- **`@coderabbitai resolve` resolves every thread**, not the one a finding
  was dismissed on, and then approves. `core/git-and-prs.md` therefore has
  the user resolve a dismissed finding's thread by hand.
- **A renamed job** blocks every pull request, its check pending forever;
  `bun/bump-verify.test.ts` already pins the name `test`.
- **A flaky `test`** (the flock cases run only on Linux) or an Actions
  outage blocks a merge: re-run it, or the user bypasses.
- **Whether the approval counts** rests on CodeRabbit's docs; the live probe
  on this change's own pull request confirms it.

## Conflict check against open changes

- `turn-gate-evidence` (#346): the turn gate and the runner's records; no
  overlap.
- `first-review-yield` (#342): reads the bot's reviews of a commit for
  findings. A clean review may now submit an approval, whose body carries no
  severity line, so it adds no finding; nothing to change.
- `notion-status-gate`: its proposal says what merged "has already passed
  the required checks"; once the user's setting lands, that is true.
- `host-deploy`: its design says the one approval is one "only the user
  gives". After this change CodeRabbit gives it, and a deploy's trust rests
  on green `test` and `budget`, a reviewed head, and whoever merges. Not
  edited here, since it is another change's artefact; revise that sentence
  when `host-deploy` is next touched.
- The `coderabbit` skill, step 1, says a review with no findings submits no
  review object. With Automatic Approvals a clean review whose threads are
  all resolved submits an approval on the head, which the step's first test
  already accepts; one with an earlier thread still open submits none, as
  the sentence says. An approval by command (`@coderabbitai approve` or
  `resolve`) also lands as a review on the head without one having run, and
  that test would read it as reviewed; only the user posts either, so the
  skill is not changed here, and the gap is reported on the card for a
  follow-up. The skill's stance that it never resolves a thread stays.
