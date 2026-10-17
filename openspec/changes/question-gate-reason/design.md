# question-gate-reason — design

## Context

The question gate (`bun/question-gate.ts`) is a `PermissionRequest` hook on
`notion-create-comment`. The tracked policy puts that tool under `ask`, so
every call raises a prompt, and the gate answers that prompt. It computes one
verdict: `question`, or the first failed condition (`unreadable`, `reply`,
`anchored`, `rich-text`, `unmarked`, `mention`, `length`, `not-a-card`,
`comments-unread`). It prints `allow` for `question` and nothing for
anything else, then records `allowed` or `passed` under that rule. Its header
says it never answers `deny`, because a person at the prompt may approve a
comment the gate does not recognise. Reading the transcript is already a
documented shortcut in it (`uses()`).

What the incident session had, measured from its transcript on 2026-10-17:

- The comment's `markdown` opened with "Шаг 2 (harness#136): …". It carried no
  mark at all.
- The strings `harness-question` and "gate's mark" never occur in that
  transcript. The session never read the gate, nor the question bullet of
  `core/feature-workflow.md`, and the stage prompt names neither.
- The tool result was Claude Code's own: "Permission for this tool use was
  denied. It requires approval, and this session has no approval surface …
  do not retry it: this action, and anything else that requires approval,
  will be denied the same way for the rest of this session."
- The first user line of the transcript is the stage prompt, recorded as a
  `/goal` command:
  `<command-name>/goal</command-name> … <command-args>Carry step 2 …\nThis session runs unattended.\nThe goal is met …`.
  The declared line stands on a line of its own inside it.

What a `PermissionRequest` hook can return to the model comes from the Claude
Code hooks reference (`code.claude.com/docs/en/hooks`, read 2026-10-17) and
the headless page (`/docs/en/headless`). It is not measured live, because
running `claude` is not allowed here:

| Channel | Reaches | Source |
| :- | :- | :- |
| `decision.behavior: "deny"` with `message` | Claude: "tells Claude why the permission was denied" | hooks, *PermissionRequest decision control* |
| `systemMessage` | The user only: "Warning message shown to the user" | hooks, *JSON output* |
| `additionalContext` | Not offered for this event; the list of events that take it leaves `PermissionRequest` out | hooks, *Add context for Claude* |
| Exit 2 with stderr | Nothing: "isn't honored for this event … stderr is discarded" | hooks, *Exit code 2 behavior per event* |
| No output | A prompt, or, where none can be shown, Claude Code's denial with "do not retry" | hooks, *PermissionRequest*; headless, *Turn off permission prompts in unattended runs* |

The hook's input carries `permission_mode`, which reads `auto` both for an
attended auto-mode session and for the board loop's
`--permission-mode auto --permission-prompts none` run. No field of the input
says whether a prompt can be shown.

## Goals / Non-Goals

**Goals:**

- A stage session's first question passes the gate, because its prompt names
  the mark exactly.
- A session that cannot show a prompt learns why its comment was refused, in
  words that let it fix the comment and send it again.
- Nothing changes for a session with a person at the prompt.

**Non-Goals:**

- The pick prompt, the card body that already holds a question, and a
  `PreToolUse` registration (see proposal.md).
- A new unattended signal. The gate reads the one agent-autonomy defines.

## Decisions

### 1. The gate answers `deny` with a reason, and only in an unattended session

The card asks for both fixes, and how the second one works is the user's
choice to weigh. The recommended option is taken here. It is in the pull
request's *Check by hand*.

- **Chosen: `deny` with `message`, only where the session declares itself
  unattended.** In such a session no answer already refuses the call, so a
  `deny` refuses nothing that was not refused before. It changes only the
  text the session reads: the gate's reason in place of the stock "do not
  retry". With a person at the prompt the gate still gives no answer, so the
  rule in the header keeps its point.
- **Rejected: a message without a decision.** `PermissionRequest` has no
  channel for that (table above). The only documented one is a second hook,
  `PreToolUse`, answering `ask` with `permissionDecisionReason`. In a `-p` run
  where nobody can answer, "Claude reads the reason in the tool result
  instead" (hooks, *PreToolUse decision control*). That costs a second
  registration, which every consumer's check would have to pin. It also runs
  the verdict on every call, and the docs do not say whether the stock "do not
  retry" text still comes with the reason.
- **Rejected: `deny` in every session.** It would take from a person at the
  prompt the comment they may approve, such as a reply in a thread the user
  asked for. `agent-permissions` keeps a reply for that prompt on purpose.

### 2. Unattended means the first prompt holds the declared line

`agent-autonomy` fixes the signal: the prompt that started the session holds
`This session runs unattended.` verbatim, on a line of its own. The gate
reads the first user line of the transcript that is a prompt, meaning text
rather than a tool result. It splits that prompt on newlines and looks for
one line exactly equal to the declared one. Text content is a string or a
list of `text` parts; the incident's `/goal` wrapper is a string whose
newlines survive.

- A transcript the gate cannot read, a change in its shape, or a prompt the
  gate cannot find all read as attended. The gate then gives no answer, which
  is today's behaviour. That is the safe side: the session is refused without
  a reason, never allowed.
- A worker that an orchestrator started, whose prompt points at a brief file
  holding the line, reads as attended. The gate does not open the brief. Such
  a worker gets today's behaviour, and its own brief names the mark.
- **Rejected: an environment variable set by `bun/board-loop-session.ts`.**
  It would miss a stage launched by hand from the form in
  `core/feature-workflow.md`. It would also be a second definition of
  unattended that can disagree with the first.
- **Rejected: `permission_mode`.** It reads `auto` in both kinds of session.

### 3. The message names the rule and what meets it

The message opens with `question-gate refused this comment (<rule>):`. Next
comes what is wrong, and then what would make the call a question. It closes
with "This refusal is the comment's, not the tool's: fix it and call
`notion-create-comment` again." Every rule's own text lives in one table in
the gate, next to the verdict:

| Rule | What the message asks for |
| :- | :- |
| `reply` | a new page-level comment, without `discussion_id` or `reply_to_comment_id` |
| `anchored` | no `selection_with_ellipsis`; the comment goes on the page |
| `rich-text` | the text as `markdown`, not `rich_text` |
| `unmarked` | `markdown` that opens with the mark, backticks included, as its very first characters |
| `mention` | no user mention |
| `length` | at most 1500 characters, the mark included |
| `not-a-card` | fetch the card with `notion-fetch` first; the page's parent must be one of the boards `D2ASS`, `Harness`, `mellon` |
| `comments-unread` | read the card's comments with `notion-get-comments` first |
| `unreadable` | a `page_id` that holds the card's 32-hex id |

The mark, the bound and the board names come from the gate's own constants,
never from a second copy of them.

### 4. The ledger records `refused`

A denial is recorded as `refused` under the same rule, the word the turn
gate already uses for a refusal. `passed` keeps its meaning, a call left to
a prompt. A count of `refused unmarked` then reads as an unattended session
that was told why.

### 5. The launch form's fourth line names the mark, from the gate

`prompt()` in `bun/board-loop.ts` gains one line after the goal condition,
for both the step and the answer variant:

> A question only the user can settle goes on the change's card as one
> page-level comment — `page_id` and `markdown` only, after reading that card
> and its comments — whose markdown opens with `` `harness-question` ``, its
> two backticks included.

The line is conditional, so a stage with no question is asked for nothing. It
sits inside the `/goal` text, as the declared line already does. The mark
comes from `MARK`, which `bun/question-gate.ts` exports, so the prompt and the
gate cannot drift apart. Importing the gate is safe, since it does its work
only under `import.meta.main`. `core/feature-workflow.md`'s launch form
carries the same line, and a test reads the line out of that file and
compares it with `prompt()`'s. The *Across the stages* bullet names the mark
where it said "the gate's mark".

## Risks / Trade-offs

- **The `deny` message is documented, not measured.** Whether it replaces
  Claude Code's "do not retry" in a `--permission-prompts none` run is read
  from the docs only. → *Check by hand*: on the first live unattended
  question after this merges, the ledger shows `refused <rule>` followed by
  `allowed question` in the same session, or the transcript shows the gate's
  message as the tool result.
- **A session resumed by hand.** Someone who resumes an unattended session
  with `claude --resume` and sits at it gets refusals with a reason instead of
  a prompt, because the first prompt still declares the session unattended.
  This follows agent-autonomy's definition, and the reason tells them what to
  fix.
- **The transcript's shape is undocumented**, as `uses()` already says. If it
  changes, the gate reads the session as attended and falls back to today's
  behaviour.
