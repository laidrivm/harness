# question-gate-reason — tasks

The test tasks come from the proposal-stage `/zombies` run. Each is written
before the code it covers (`core/testing.md`). The numbers in brackets are
that run's idea numbers, and all 23 are placed below.

The gate's cases run `bun/question-gate.ts` as the hook runs it, through
`bun/question-gate.fixture.ts`. The launch form's cases run the board loop
through `bun/board-loop.fixture.ts` and read the stage prompt from the stub
`claude`'s calls. `bun/board-loop.test.ts` is at 293 lines of its 300 cap, so
new loop cases go in `bun/board-loop-stage.test.ts`.

One group, one pull request: `feat/question-gate-reason`.

## 1. The launch form names the mark, and the gate says why it refused

- [x] 1.1 In `bun/question-gate.fixture.ts`, give `transcript()` a way to write
      user prompt lines before the calls. A prompt is a plain string, or a
      list of `text` parts, or the `/goal` command wrapper the incident's
      transcript shows, with its `<command-args>` text keeping its newlines.
      Add an `UNATTENDED` constant holding the declared line. Verify: the
      existing question-gate test files are green, unchanged.
- [x] 1.2 Write the unattended cases in a new
      `bun/question-gate-unattended.test.ts`. Under spec-citation comments for
      the new agent-permissions scenarios and gate-ledger's *A comment the
      question gate refuses*:
      - an unmarked comment in a session whose first prompt holds the line is
        answered `deny` with exit 0, as `hookSpecificOutput` with
        `hookEventName: "PermissionRequest"`, `decision.behavior: "deny"` and a
        `message` [3];
      - the ledger records it as `refused` under `unmarked` [4];
      - a conforming question in the same session is still answered `allow` [5];
      - each of `reply`, `anchored`, `rich-text`, `unmarked`, `mention`,
        `length`, `not-a-card`, `comments-unread` and `unreadable` (a page
        id with no 32-hex id) gets a message naming that rule and its own
        remedy, one case per rule [6];
      - two failing conditions name only the first, `reply`, in the message as
        in the ledger [8];
      - the `length` message names the bound 1500 [11];
      - every message opens with `question-gate refused this comment (<rule>):`
        [15];
      - a refused unmarked comment, then the same session's conforming one,
        is `refused` then `allowed`, in that order [19].
      Each case fails before 1.4, except [5]. (Req: agent-permissions — A
      question to the user on a board card needs no prompt; gate-ledger — Every
      gate refusal is recorded)
- [x] 1.3 In the same file, write the cases that decide unattended:
      - a transcript with no prompt line, tool calls only, reads attended: no
        output, `passed` [1];
      - an empty first prompt reads attended [2];
      - the line only in the second prompt reads attended [7];
      - the line with a trailing space, or inside a longer line, reads
        attended [9];
      - the line as the prompt's last line, with no newline after it, reads
        unattended [10];
      - the line inside the `/goal` wrapper reads unattended [12];
      - a prompt written as a list of `text` parts reads unattended [13];
      - a user line holding only a `tool_result` is no prompt, so the prompt
        after it is the first one [14];
      - an event whose `transcript_path` does not exist gives no answer and
        records `passed` [16];
      - an event that is not JSON gives no answer and records `passed
        unreadable` [17];
      - a ledger that cannot be written leaves the `deny` standing [18].
      [1], [2], [7], [9], [16] and [17] pass before 1.4 and after. The rest fail
      before it. (Req: agent-permissions — A question to the user on a board
      card needs no prompt, §*The line outside the first prompt*, §*The hook
      cannot read what it decides on*)
- [x] 1.4 In `bun/question-gate.ts`, export `MARK` and read the first prompt
      from the transcript as design.md Decision 2 sets out. Answer `deny` with
      the message from one rule-to-remedy table (Decision 3), built from
      `MARK`, `LIMIT` and `BOARDS`, and record `refused`. Rewrite the header
      comment: the gate never answers `deny` where a person may be at the
      prompt, and why it does where the session is declared unattended.
      Verify: 1.2, 1.3 and both existing question-gate files are green, and
      the file is under its cap in `bun/file-size.ts`.
- [x] 1.5 Write the launch form cases in `bun/board-loop-stage.test.ts`:
      - the stage prompt has four lines, and the fourth holds `MARK` imported
        from `bun/question-gate.ts`, together with `page_id`, `markdown` and
        "page-level" [20];
      - an answer step's prompt carries the same fourth line [21];
      - `core/feature-workflow.md` holds that fourth line verbatim [23].
      Also change the existing case "the stage session's prompt is still the
      launch form's three lines" in `bun/board-loop.test.ts` to four lines
      [22]. Each fails before 1.6. (Req: stage-goal — An unattended stage runs
      under one goal on the check, §*A stage asks its question*)
- [x] 1.6 In `bun/board-loop.ts`, add the fourth line to `prompt()` from the
      imported `MARK` (design.md Decision 5). In `core/feature-workflow.md`,
      add the same line to the *Unattended stages* launch form, and say there
      that the answer, proposal and archive variants keep it. Name the mark in
      the *Across the stages* question bullet, where it says "the gate's mark".
      Verify: 1.5 and the runner's three test files are green.
- [ ] 1.7 Search the four places `core/feature-workflow.md` names for the
      claims this replaces: "refuses nothing", "never answers `deny`",
      "gives every other call no answer", "the gate's mark", and "allowed or
      passed to the prompt". Reconcile each live site: `README.md` lines on
      the question gate and the ledger, `bun/bootstrap.ts`'s registration
      comment, and any card on the boards that restates them. Name
      archived changes as history. Verify: the grep in the pull request
      body.
- [ ] 1.8 The pull request's *Check by hand* names design.md Decision 1 for
      the user to confirm. It also names the deliberate live check from
      design.md's first risk. One unattended session posts an unmarked
      comment on a card, then the same question marked. Expect
      `refused unmarked` and then `allowed question` in the ledger, and the
      gate's message as the first call's tool result. Record whether it
      replaced the stock "do not retry" text. Verify: the pull request body
      holds both.
