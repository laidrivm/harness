# agent-autonomy

## Why

The harness is written for a session with the user at the terminal. Its
prose stops the loop at every step that names the user. The pull request
waits for "the user's go-ahead", the archive waits for the user to be
prompted to run `/opsx:archive`, a 🟠 Major dismissal "is put to the user",
and a new rule is added "after the user confirms". An unattended session that
reaches any of these steps has two choices, and both are wrong. It can stall,
or it can guess which of those steps the user would let it take. Under
`--permission-prompts none`, anything that asks for permission is a silent
refusal.

The roadmap's A3, "the human, asynchronously", needs every such step to say
which of three things it is: an act the agent may take alone, a question
that waits on the card, or an act that stays with the user. The card-questions
change (harness#56) gives the second of these a place to wait. This change
gives each step its class.

## What Changes

- A new doc, `core/autonomy.md`, read on demand. It states when a session is
  unattended: when the prompt or brief that started it says so, and never
  otherwise. Attended sessions follow every step as written. The doc defines
  three classes, `agent`, `card` and `user`, and what an unattended session
  does under each:
  - `agent`: it takes the step and records what it did in the user's stead.
  - `card`: it hands the question on through the card-questions procedure, and
    the work that waits on it stops.
  - `user`: it neither takes the step nor asks for it, and reports `BLOCKED`.

  An ask, a wait or a confirmation that carries no class is `card`, whether
  it sits in this harness's prose, a vendored skill or an OpenSpec command.
  The doc also says which request a stage's own command is waiting for, so
  that `/opsx:explore`'s capture confirmation is the runner's prompt.
- Each step on the loop's critical path that waits on, asks, or hands an act
  to the user gets an inline `(unattended: <class> — …)` marker. The critical
  path is explore, propose, apply, the pre-PR sequence, opening the pull
  request, archive, and the gate skills `zombies`, `warm`, `triage` and
  `coderabbit-local`. The markers go into `core/feature-workflow.md`,
  `core/review-toolkit.md`, `core/rules.md`, `core/git-and-prs.md`,
  `core/code-style.md` (its supply-chain stops, which apply reaches), and
  those four skills.
- `core/rules.md` and `CLAUDE.md` link the doc, so a consumer's copy reaches
  it. `sync.ts` already copies every Markdown file in `core/`.
- A test pins the vocabulary. Every marker under `core/` names a class the doc
  defines, the doc defines exactly the three, and `core/rules.md` links it.

## Non-goals

- The eight `disable-model-invocation` flags and `agent-permissions`'s *Who
  may invoke a skill is enforced, not narrated*. Each flag's reason and class,
  the `/coderabbit` paragraph that equates invoking it with the user's
  approval, and the prose of the skills reserved for the user (`ship`,
  `pr-brief`, `checklist`, `session-wrapup` and the rest) are the named
  follow-up *agent-autonomy-flags*. Until it lands, those skills start from a
  prompt, the user's or a runner's, as they do today.
- Steps off the critical path: `core/verification.md`, `core/testing.md`,
  `feature-generator`, `spec-generator`, and the consumers' own `CLAUDE.md`
  and `openspec/config.yaml`. Each one reads as `card` by default until a
  follow-up marks it.
- The question's envelope, the cap, `Assign` and the `Questions` view. These
  belong to the card-questions change (harness#56). The question's form
  (a recommended answer, rounds of independent questions) belongs to the idea
  card *Ask proposal-stage questions with a recommended answer, in rounds of
  independent ones, and look facts up first*.
- Permission prompts. A prompt that an unattended session cannot show is a
  refusal, and `policy-gate-beyond-bash` decides which tools prompt.
- A mechanised signal for "unattended", such as an environment variable or a
  `/goal` objective. That is the card *Formalise /goal in harness sessions*.
- A scan that finds an unmarked ask. The phrasing is too varied for a check
  to be anything but a guess, so the default class covers what it misses.

## Ordering

This change comes after card-questions. Until that change exists, `card` has
no procedure to hand a question to.

## Capabilities

### New Capabilities

- `agent-autonomy`: what an unattended session does at a step that names the
  user. It covers the three classes, the default for a step with no class, and
  how a step states its class.

### Modified Capabilities

None.

### Unmodified, but adjacent

- `local-review-loop`'s *Dismissing a Major or above is the user's call*
  keeps its `OPEN` gate line. The marker on `core/review-toolkit.md` says what
  an unattended session does while that line reads `OPEN`.
- `agent-permissions`'s *Who may invoke a skill is enforced, not narrated*
  is unchanged until *agent-autonomy-flags*.

## Impact

- New: `core/autonomy.md` and `bun/autonomy.test.ts`.
- Edited: one inline marker per classified step in `core/feature-workflow.md`,
  `core/review-toolkit.md`, `core/rules.md`, `core/git-and-prs.md`,
  `core/code-style.md`, and `core/skills/{zombies,warm,triage,coderabbit-local}/SKILL.md`;
  one link line each in `core/rules.md` and `CLAUDE.md`.
- Consumers: the doc and the markers reach them through `sync.ts` on their
  next bump, and nothing is done by hand. No gate changes, so neither consumer
  tree is measured.
- Interactive sessions: no change. A marker only says what an unattended
  session does.
