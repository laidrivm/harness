# ci-evidence-on-main — tasks

One group and one harness pull request, on `feat/ci-evidence-on-main`.
Task 1.3 is the user's: it is a GitHub setting, and the agent never changes
one. Task 1.4 waits on it.

## 1. The bot's approval, the doc, the ruleset and the probe

- [x] 1.1 Test first: in `bun/review-config.test.ts`, a case reading the
      repository's `.coderabbit.yaml` through `bun/review-config.ts`'s parse
      (lifted into exported `parsed` and `at`) expects
      `reviews.auto_approvals.enabled` to be `true`,
      `reviews.auto_review.drafts` not to be `true` and the legacy alias
      `reviews.request_changes_workflow` to be absent, tagged with both of the
      new requirement's scenarios; a second case expects
      `reviews.auto_review.auto_pause_after_reviewed_commits` to be `0`.
      Record that each fails, then add `reviews.auto_approvals.enabled: true`
      and the pause at `0` to `.coderabbit.yaml`, each with a comment saying
      why, and update the header comment that says the config does nothing
      but point the bot at the rulebook. `bun test
      bun/review-config.test.ts` is green. (Req: local-review-loop — The
      review bot's approval is the pull request's one approval; The review
      bot does not pause on a long pull request)
- [x] 1.2 In `core/git-and-prs.md`, beside the sentence ending "the PR is
      mergeable only once CI is green and CodeRabbit has reviewed its head
      with every finding dispositioned", one short paragraph: a merge into
      `main` needs `test` and `budget` green from GitHub Actions and one
      approval, which CodeRabbit gives on a reviewed head with every
      required thread resolved; an oversized pull request passes `budget`
      through `oversize: <reason>` in its body; the user's admin bypass
      lifts all of it, and an agent identity has none; a dismissed
      finding's thread is resolved by the user by hand on that thread —
      `@coderabbitai resolve` resolves every bot thread and approves — and no
      agent posts that command, `@coderabbitai approve` or any comment as
      the user.
      `bun test` is green (the doc checks read `core/`).
- [ ] 1.3 **The user**, before this pull request merges — 1.4 probes it
      here, and `core/git-and-prs.md` states the ruleset as in force — in
      Settings → Rules → Rulesets → `main`:
      - *Require status checks to pass*: on; add `test` and `budget`, each
        with source *GitHub Actions*; *Require branches to be up to date
        before merging*: off.
      - *Require a pull request before merging*: keep it, with *Required
        approvals* 1.
      - *Dismiss stale pull request approvals when new commits are pushed*:
        on — left off, an earlier head's approval would still count after a
        push (design.md, *A stale approval*).
      - Bypass list: unchanged (Admin, always).

      Done when `gh api repos/laidrivm/harness/rulesets/25440192` lists a
      `required_status_checks` rule naming `test` and `budget` with the
      GitHub Actions integration id (15368) and
      `strict_required_status_checks_policy: false`, its `pull_request` rule
      reads `required_approving_review_count: 1` and
      `dismiss_stale_reviews_on_push: true`, and its bypass is the Admin role,
      `always`.
- [ ] 1.4 Live probe, after 1.3: on this change's own pull request,
      CodeRabbit either requests changes (actionable findings) or approves
      (a reviewed head with every required thread resolved), and the merge
      box shows `test` and `budget` as required; `gh pr view <n> --json
      reviewDecision,mergeStateStatus` reads `APPROVED` once the bot has
      approved, and `BLOCKED` before. Leave this unticked while 1.3 is
      undone. (Req: local-review-loop — The review bot's approval is the
      pull request's one approval)
