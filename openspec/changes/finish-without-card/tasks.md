# Tasks

## 1. Tests first

- [ ] 1.1 In `bun/work-finish.test.ts`, drop *no --card* from the usage table and re-cite it to `work-finish/a-malformed-card`; record that a card-less run now fails the new cases below
- [ ] 1.2 In `bun/work-finish-sequence.test.ts`, add a card-less first finish (push, draft, ready, no Notion read), a card-less finish with no ask settings (still ready), and a card-less finish with no run record (refused before the push), cited to `work-finish/no-card-no-question-check`; run them and record that they fail

## 2. Code

- [ ] 2.1 `bun/work.ts`: accept a missing `--card`, keep a malformed one refused, and show `[--card <id>]` in the usage and the header comment
- [ ] 2.2 `bun/work-finish.ts`: take the card as optional and skip the ask integration and `waiting()` without it; the tests of 1.x pass
- [ ] 2.3 `bun/ready-guard.ts`: name `--card` as optional in both refusal texts

## 3. Docs

- [ ] 3.1 `README.md` and `core/git-and-prs.md`: say `--card` is optional and that without it no question is read
