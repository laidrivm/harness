# capture-as-mechanism — tasks

The check items come from the proposal-stage `/zombies` run, and all 12
ideas are placed below. The deliverable is prose, which no `bun test` can
exercise. Each idea is therefore a read-back check over the changed text, or
a replay of a past capture through the new routing, and it is done before the
item is ticked. Bracketed numbers are the run's idea numbers.

One group, so the change ships whole on `feat/capture-as-mechanism`.

## 1. The question, and its count

- [ ] 1.1 In `core/rules.md`, add the capture step's first bullet. It asks
      whether a mechanism (a test over the code the lesson is about, or a
      gate: a `harness:check` check, a hook, a permission entry) can hold
      the lesson. Under it go three sub-bullets: add the test in the same
      turn and write no rule; file a card on the board of
      the repository that would ship it and write the rule as a stop-gap; or
      write the rule and tell the user why no mechanism fits. Name *A
      mechanised prohibition leaves its prose home* rather than restating
      it. Read back:
      - the one-off branch still short-circuits before the question [1];
      - the card's board is named [2].

      Replay three past captures through the text:
      - "re-fetch a card after setting its properties" routes to
        `card + rule` [3];
      - "invalidate earlier OTP codes when generating a new one" (the
        rule quality bar's own example) routes to `mechanism`, a test over
        the generator [4];
      - "British English by default" routes to `rule` with a reason [5].

      Record the always-on line count before and after in the commit
      message. (Req: agent-rulebook — A captured lesson is weighed as a
      mechanism before it is written as prose)
- [ ] 1.2 In `core/skills/session-wrapup/SKILL.md`, make step 2 tag every
      proposed capture with one of `mechanism`, `card + rule`, `rule`,
      `skill edit`, `memory`. Make step 5 append exactly one line,
      `- captures: N mechanism, N card + rule, N rule, N skill edit,
      N memory`, with all five kinds always present in that order. Add the
      line to the example. Read back:
      - `Nothing to capture.` still yields the line, at zero [6];
      - mixed kinds give one line, not one per capture [7];
      - the append-only wording covers the new line, so a second wrap-up on
        the same day appends rather than rewrites [8];
      - the line goes to the month file step 5 already names [9];
      - the format sums with one `grep` over a month's file [10];
      - the five kind strings are spelled the same in step 2, step 5 and the
        example [11];
      - a declined capture is counted under its proposed kind [12].

      Update the skill's `description` and the `README.md` row only if they
      enumerate step 5's contents, so they don't drift. (Req:
      agent-rulebook — The yield ledger counts captures by kind)
- [ ] 1.3 Grep `core/`, `README.md` and `openspec/specs/` for every site that
      restates the capture routing or step 5's lines, and reconcile each one.
      If `gate-decision-ledger` has merged first, rebase over its step-5
      edit and keep both lines (design.md, *One ledger line…*). `bun test`
      green.
