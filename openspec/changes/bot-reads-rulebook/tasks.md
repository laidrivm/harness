# bot-reads-rulebook — tasks

Two steps, so this change ships as two pull requests on
`feat/bot-reads-rulebook-1` and `-2`, in that order.

The delta modifies §*A justification survives only when it is a convention*
in its wording only, so its two criteria are carried and not closed:
`a-convention-the-bot-does-not-know` and `a-one-off-skip`. The removed
alignment requirement takes three criteria with it, none cited by a test:
`the-saved-prompts-carry-this-repo-s-instructions`,
`the-saved-prompts-do-not-carry-them` and `the-question-is-unanswered` — so the
count of uncited criteria falls at archive, and no floor edit is needed in
either step.

The numbers in brackets refer to the ideas in the proposal-stage `/zombies`
run over this change.

## 1. The PR bot reads the rulebook

Closes `local-review-loop/a-doc-the-rulebook-indexes-falls-out-of-reach`,
`local-review-loop/a-pattern-that-matches-nothing`,
`local-review-loop/a-config-the-test-cannot-read`.

- [x] 1.1 Write `bun/review-config.test.ts` first, with cases built on
      temporary fixture repositories and each citing its criterion. Each
      fixture below carries a parseable `.coderabbit.yaml` whose patterns
      produce exactly the mismatch named, and each case asserts the failure
      names that doc or pattern, so none can pass for the config being absent.
      Record that the case over the repository itself (13) fails while the
      root has no `.coderabbit.yaml`. The cases: a
      `CLAUDE.md` linking a doc outside every pattern fails, naming that
      doc (ZOMBIES 5); `core/rules.md` itself unmatched fails, naming it
      (4); one live pattern beside one that matches no tracked file fails,
      naming only the second (6); a pattern matching only an untracked file
      counts as matching nothing (9)
- [x] 1.2 Add the cases where the config is unreadable, each failing and
      saying which way: the file is absent (3); the YAML does not parse, with
      the parser's message and the path (11); the `filePatterns` key is
      missing (1); the list is empty (2); an entry is empty or blank (8); an
      entry is not a string, named by its position (10)
- [x] 1.3 Add the boundary cases: `core/*.md` does not match
      `core/skills/<name>/SKILL.md` (7); an `https://` link in `CLAUDE.md` is
      not taken as a doc (12); a `README.md` link is exempt and needs no
      pattern; a doc that only `core/rules.md` links, outside every pattern,
      fails
- [x] 1.4 Write the exemption into the test with its reason. Verify that the
      fixture which links `README.md` from `CLAUDE.md` passes, and that the
      same fixture fails without the exemption
- [x] 1.5 Add the root `.coderabbit.yaml`. It sets
      `knowledge_base.code_guidelines.filePatterns: ["core/*.md"]` and
      nothing else. A comment in it says why the glob is flat, and that
      `**/CLAUDE.md` is CodeRabbit's default rather than an omission. Verify
      that the suite passes over the repository as it stands (13) and that
      `bun bun/check-yaml.ts` parses the file
- [x] 1.6 Reword the `core/rules.md` §*The loop* sentence that names
      `**/CLAUDE.md` and `docs/*.md`. The new wording says a rule is read
      back wherever the repository's `.coderabbit.yaml` names the paths the
      rulebook and its docs sit at, and it names no glob (design.md §*The
      prose names no glob*). Verify by reading the sentence as it stands in
      the harness, in d2ass's `harness/rules.md` and in mellon's
- [x] 1.7 Reword `README.md`'s consumer line saying the copy in `harness/` is
      what "its review bot reads". The bot reads the copy once the project's
      `.coderabbit.yaml` names `harness/*.md` under `code_guidelines`. Say
      that, and nothing about any one consumer's visibility or settings
- [ ] 1.8 Search the four places that restate a decision for the old claim.
      Grep `docs/\*\.md`, `code_guidelines` and `review bot` across the
      sibling artefacts, `openspec/specs/**`, the cards on the boards and the
      README map. Reconcile each site in this step. Where a site lies outside
      this change, list it in the step's pull request body with the change
      or card that will reconcile it. Where none exists, file a card.

## 2. The local review reads what the PR bot reads

Closes `local-review-loop/the-config-names-guideline-files`,
`local-review-loop/a-repository-with-no-config`,
`local-review-loop/a-file-two-sources-name`.

The skill is prose and no test runs it. Each criterion is closed by a recorded
run, and this step's pull request body quotes the command each run issued.

- [ ] 2.1 Change `core/skills/coderabbit-local/SKILL.md` step 2. Read
      `knowledge_base.code_guidelines.filePatterns` from the parsed
      `.coderabbit.yaml`, not from a line that resembles it, and expand each
      pattern with `git ls-files ':(glob)<pattern>'`. Then pass `--config
      .coderabbit.yaml CLAUDE.md` followed by every file matched, each once.
      Where no `.coderabbit.yaml` exists, there is nothing to expand, and the
      skill passes `--config CLAUDE.md` alone (16).
      Add `Bash(git ls-files:*)` to `allowed-tools`. State at the expansion
      why the `:(glob)` magic is there: a plain pathspec matched 34 files where
      the bot matches 9 (ZOMBIES 14)
- [ ] 2.2 Run `/coderabbit-local` once in the harness over this step's
      branch. Record the invocation it issued: `.coderabbit.yaml`, `CLAUDE.md`
      and the markdown files directly under `core/`, with none under
      `core/skills/` (17). Record whether the CLI accepted the longer list. If
      it refused, stop and report, per design.md §Risks
- [ ] 2.3 Build the invocation by hand from d2ass's tree, read-only, and
      record that `CLAUDE.md`, which `**/CLAUDE.md` also matches, appears once
      (15). Record the 2 `docs/*.md` and 9 `harness/*.md` files it lists (17)
- [ ] 2.4 Build the invocation from mellon's tree, read-only, and record that
      it is `--config CLAUDE.md` alone (16)
- [ ] 2.5 Reword `core/review-toolkit.md`'s sentence saying the CLI does not
      read `.coderabbit.yaml` on its own. The CLI's docs say it does, but only
      while no `--config` is given, and the skill always gives one. The
      reworded sentence says the skill therefore passes the config and the
      guideline files it names. Verify that no other site restates the old
      invocation: grep `--config .coderabbit.yaml CLAUDE.md` across the tree
      and the boards
