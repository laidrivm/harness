# ci-evidence-on-main — tasks

One group and one harness pull request, on `feat/ci-evidence-on-main`.
Task 1.3 is the user's: it is a GitHub setting, and the agent never changes
one. Task 1.4 waits on it.

## 1. The bot's approval, the doc, the ruleset and the probe

- [ ] 1.1 Test first: in `bun/review-config.test.ts`, a case reading the
      repository's `.coderabbit.yaml` with `Bun.YAML.parse` expects
      `reviews.auto_approvals.enabled` to be `true` and
      `reviews.auto_review.drafts` not to be `true`, tagged with both of the
      new requirement's scenarios. Record that it fails, then add
      `reviews.auto_approvals.enabled: true` to `.coderabbit.yaml` with a
      one-line comment saying why, and update the header comment that says
      the config does nothing but point the bot at the rulebook.
      `bun test bun/review-config.test.ts` is green. (Req: local-review-loop
      — The review bot's approval is the pull request's one approval)
- [ ] 1.2 In `core/git-and-prs.md`, beside the sentence ending "the PR is
      mergeable only once CI is green and CodeRabbit has reviewed its head
      with every finding dispositioned", one short paragraph: a merge into
      `main` needs `test` and `budget` green from GitHub Actions and one
      approval, which CodeRabbit gives on a reviewed head with every
      required thread resolved; an oversized pull request passes `budget`
      through `oversize: <reason>` in its body; the user's admin bypass
      lifts all of it, and an agent identity has none; a dismissed
      finding's thread is resolved by the user, or by the user's top-level
      `@coderabbitai resolve`, never by an agent posting as the user.
      `bun test` is green (the doc checks read `core/`).
- [ ] 1.3 **The user**, in Settings → Rules → Rulesets → `main`:
      - *Require status checks to pass*: on; add `test` and `budget`, each
        with source *GitHub Actions*; *Require branches to be up to date
        before merging*: off.
      - *Require a pull request before merging*: keep it, with *Required
        approvals* 1.
      - Recommended, the user's call (design.md, *A stale approval*):
        *Dismiss stale pull request approvals when new commits are pushed*:
        on.
      - Bypass list: unchanged (Admin, always).

      Done when `gh api repos/laidrivm/harness/rulesets/25440192` lists a
      `required_status_checks` rule naming `test` and `budget` with the
      GitHub Actions integration id (15368).
- [ ] 1.4 Live probe, after 1.3: on this change's own pull request,
      CodeRabbit either requests changes (actionable findings) or approves
      (a reviewed head with every required thread resolved), and the merge
      box shows `test` and `budget` as required; `gh pr view <n> --json
      reviewDecision,mergeStateStatus` reads `APPROVED` once the bot has
      approved, and `BLOCKED` before. Leave this unticked while 1.3 is
      undone. (Req: local-review-loop — The review bot's approval is the
      pull request's one approval)
