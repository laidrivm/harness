# agent-autonomy-flags — design

## Context

The motivation is in proposal.md, *Why*. The requirements are in
`specs/agent-permissions/spec.md` and `specs/agent-autonomy/spec.md`.

What Claude Code does with the flag was read from its skills page on
2026-10-18 and probed where a probe was possible:

- The documentation says the flag hides the skill's description from the
  model. When the model calls the skill anyway, Claude Code blocks the call
  and tells it not to carry out the steps another way. The flag also keeps the
  skill from being preloaded into a sub-agent, and from running when a
  scheduled task fires with the skill as its prompt. A `/name` at the start of
  the user's message still runs the skill directly.
- Probed in a sub-agent session started from an orchestrator's brief: the
  Skill tool refused `review-order` with "cannot be used with Skill tool due
  to disable-model-invocation … it is reserved for explicit user invocation".
  None of the five flagged skills linked in this repository (`checklist`,
  `coderabbit`, `first-five`, `review-order`, `session-wrapup`) appeared in
  that session's skill listing. The orchestrator met the same refusal on
  `coderabbit`.
- Not probed: whether `claude -p` with a prompt that opens on `/name` runs a
  flagged skill. The page does not say, and a sub-agent here may not start
  `claude`. Nothing below depends on the answer.
- `allowed-tools` grants its tools without a prompt for the turn that invokes
  the skill, whoever invokes it. Deny and ask rules and hooks still apply.

`ship` step 5 invokes `coderabbit` through the Skill tool, and step 1 invokes
`pr-brief` the same way. Both calls are refused today.

## Goals / Non-Goals

**Goals:**

- Each flag stands for a risk its skill's run actually carries, and that
  reason is written where a reviewer reads the change.
- `/coderabbit` can run without anyone present, and still cannot burn a
  session waiting for the bot.

**Non-Goals:**

- Writing a list of the flagged skills into a tracked doc (D4).
- Changing what the kept skills do.

## Decisions

### D1. Which skills keep the flag

A skill keeps the flag only when its run does more than read, report, or
apply the fixes the review policy already lets the agent apply.

| Skill | Flag | Reason |
| --- | --- | --- |
| `coderabbit` | drop | It reads the pull request and applies verified fixes, as `/coderabbit-local` does unflagged. The risk was the wait, which D2 guards. |
| `first-five` | drop | It reads the diff and reports. |
| `review-order` | drop | It reads the diff and reports. |
| `pr-brief` | drop | It reads the branch and prints a title and body. It opens and pushes nothing. |
| `ship` | keep | It merges, which `autonomy.md` keeps with the user, and it sleeps for up to nine minutes waiting for the bot. |
| `code-review` | keep | It can hand the diff to `codex`, `aider` or `goose`, and its `allowed-tools` grants those three without a prompt. Which outside agent sees the code is the user's call. |
| `session-wrapup` | keep | The user decides when a session ends. It writes `docs/context/` and corrects board cards, with a Notion update granted in `allowed-tools`. |
| `checklist` | keep | It writes `.claude/plans/<name>-checklist.md` from whatever plan is in context. Its description names no trigger, so a model could start it whenever any plan is in view. |

Alternative: drop all eight and rely on the descriptions' "use when the user
asks". That was rejected because a description is narration, and
`agent-permissions` requires the restriction to be enforced. Another
alternative was a `skillOverrides` entry in settings in place of the
frontmatter. It was rejected because it has the same effect, and a consumer's
settings would have to repeat it.

### D2. `/coderabbit` reads once and never waits

Step 1 of the skill reads the reviews (its third `gh api` call) before
anything else. If none comes from a `coderabbitai` login, the run ends on
`CODERABBIT gate: OPEN — no CodeRabbit review on PR #N yet.` The skill's
rules gain one line: fetch once per run, and never sleep, poll, `--watch` or
fetch again to see whether the bot has posted. When reviews exist but none is
on the head commit, the run dispositions what is there and states below the
gate line that `<sha>` has no review yet. That is the environment-fact rule
the skill already has.

Alternatives considered:

- Requiring a review of the head commit before reading anything. Rejected:
  the bot can skip a commit (paused reviews, a path filter, the draft period),
  and its findings on earlier commits would then be unreadable until it posts
  again.
- A hook that refuses `sleep` while `/coderabbit` runs. Rejected because the
  cost of a wait is session time, not safety. `git-and-prs.md` already says
  never to wait on a review bot. The skill's `allowed-tools` grants no
  `sleep`, unlike `ship`'s.

### D3. Approval and markers

`core/review-toolkit.md` stops treating the user's invocation as the approval
for fixes. A verified finding is applied without asking because the review
policy says so, and a wrong fix on an open pull request costs one more
commit. Dismissing a Major or Critical stays the user's
`(unattended: card — …)`. In the skill, step 5's generic "Wait for approval"
and the project-override sentence on dismissals each get a `card` marker. The
marker check in `bun/autonomy.ts` already scans `core/skills/`.

### D4. No list of flagged skills outside their frontmatter

`core/autonomy.md` gains one paragraph under `user`: a skill whose frontmatter
carries the flag is a `user` step. It names no skills. The README already
says the flag is recorded once, in the frontmatter, because a restatement
drifts without breaking anything. The reasons in D1 live in this change,
which a reviewer of a later flag change can find.

### D5. `first-five` loses `Bash(find:*)`

`find` with `-delete` or `-exec` changes the tree. When `first-five` could
only be started by the user, the grant covered a run the user had asked for.
Once the model can start the skill, a model-started run would get the same
grant. The skill uses `find` only to check that a path exists, and Glob does
that lookup. `ls` and `grep` stay. The other three skills whose flag goes
grant only git reads, `gh` reads and the file tools. `coderabbit`'s
`Bash(gh api:*)` matches a write as well, but the command guard refuses that
write (*GitHub write commands are denied*) whatever `allowed-tools` grants.

### D6. The test pins only the four that drop

`bun/skill-flags.test.ts` parses each of the four skills' frontmatter with
`Bun.YAML.parse`, the structure Claude Code reads, and fails if
`disable-model-invocation` is `true`. It does not pin the four that keep the
flag. `agent-permissions`' *The permission policy is pinned by a test* says
that removing a skill's flag fails no test. Whether a kept flag should go is
also a decision for review, not something a test can settle.

## Risks / Trade-offs

- [The descriptions of `coderabbit`, `first-five`, `pr-brief` and
  `review-order` now sit in every session's skill listing, here and in each
  consumer] → each description is a few hundred characters and says "use when
  the user asks". The listing budget drops descriptions of rarely used skills
  first.
- [A model could start `first-five` or `review-order` when asked for "a
  review"] → both only read. Starting one costs tokens, not state.
- [`pr-brief`'s What/Why/Verify/Risk body does not match the body
  `git-and-prs.md` asks for] → no checkout links `pr-brief`. The mismatch
  exists whoever starts it, so it is filed as out of scope rather than fixed
  here.

## Migration Plan

Nothing to migrate. Consumers get the change with their next pin bump, and
the skills they link change in place. Rollback is reverting the pull request.

## Decisions for the user to check

- D1's split: keeping `session-wrapup` and `checklist` user-only, and dropping
  the flag from `pr-brief`. The recommended option was taken in each case.
