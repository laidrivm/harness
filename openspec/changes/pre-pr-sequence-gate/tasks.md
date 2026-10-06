# pre-pr-sequence-gate — tasks

Test tasks come from the proposal-stage `/zombies` run and are written before
the code they cover (docs/testing.md — TDD for edge cases). The bracketed
numbers are that run's idea numbers, so each of its 23 ideas is traceable to
the group that closes it. Idea 17 is absent from the list below because it
stopped being a case: it asked what a branch with no remote counterpart does,
and the review that followed removed the branch's push state from the
conditions altogether, so there is nothing left to answer.

Three groups, so three pull requests on `feat/pre-pr-sequence-gate-1` … `-3`,
in order. Group 1 is a measurement that can cancel the rest, group 2 is the
decision module, group 3 wires it up and shortens the prose.

## 1. What the events actually do

- [ ] 1.1 Measure whether a project-level `UserPromptSubmit` entry in
      `.claude/settings.json` composes with the ponytail plugin's or replaces
      it, by registering a marker entry and observing both in a session
      started afterwards — a permissions or hook change is only observable in
      a session started after it. The design rests on both firing; nothing
      else in this change is worth building if they do not.
      (Req: commit-gates — A turn that commits reports its gates before it
      ends)
- [ ] 1.2 Measure the cost the proposal records as owed: the wall time a
      `Stop` hook adds to a turn end, and the wall time the `UserPromptSubmit`
      mark adds to a prompt, both against the guard's existing 16–22 ms figure
      so the numbers are comparable. Record them in this change's `design.md`,
      which archives with it — not into that figure's own home, which is a
      requirement in `openspec/specs/agent-permissions/spec.md` and is a hand
      edit to a spec this change holds no delta for. Where the combined
      per-turn cost contradicts what that requirement claims, say so and name
      the delta it needs. `merged-branch-guard` task 2.3 measures the same
      surface and carries the same constraint; whichever lands second reads
      the first's numbers rather than taking its own afresh.
      (Req: commit-gates — A turn that commits reports its gates before it
      ends)
- [ ] 1.3 Confirm by probe that a `Stop` hook exiting 2 prevents the turn
      ending and that its stderr reaches the model, and that exiting 1 does
      not — the documentation says so, and this capability's own rule is that
      a hook's behaviour is what the hook does. Record the whole payload the
      event carries, and settle two questions from it rather than from any
      summary: whether a `stop_hook_active` field exists — two readings of the
      documentation and the review bot disagree, and nothing in this design
      depends on the answer — and which lifecycle events fire when a turn is
      interrupted instead of ending, since a turn this hook never sees is one
      the gate does not reach.
      (Req: commit-gates — A turn that commits reports its gates before it
      ends)

## 2. The decision module

- [ ] 2.1 Write the task-file reading tests in `scripts/turn-gate.test.ts`: a
      group whose last box is ticked is complete [4]; a group with an unticked
      box is not [6, 22]; a group with no boxes at all is not [8]; `- [X]`
      counts as ticked [10]; a checkbox inside a fenced code block does not
      count [11]; a file with no group headings completes nothing [9]; a
      change under `archive/` is not read [2]; a repository with no
      `openspec/changes/` completes nothing [1]; two active changes trigger on
      either [5]. (Req: commit-gates — A turn that commits reports its gates
      before it ends, §*Every group still has work in it*, §*The completed
      group belongs to an archived change*, §*A group that carries no boxes*)
- [ ] 2.2 Write the turn-state tests: `HEAD` equal to the mark is a turn that
      did not commit [12]; `HEAD` moved by an amend is a turn that did [13];
      four commits read the same as one [7]; a turn that commits and then
      returns `HEAD` to the mark ends, since nothing it committed survives to
      be reported; a second refusal with the same mark does not happen; a
      second session is decided against its own mark rather than the newest;
      an absent mark ends the turn [21 mark half]; an unreadable mark ends the
      turn [18]. (Req: commit-gates — A turn that commits reports its gates
      before it ends, §*A turn that commits nothing*, §*The mark was never
      written*, §*A turn whose commits are withdrawn before it ends*, §*A
      refusal is not repeated*, §*Two sessions in one repository*)
- [ ] 2.3 Write the test the removed push condition earned: a turn that
      commits the last task, pushes the branch, and ends with no gate line is
      still blocked. The condition it replaces would have passed exactly this
      case, so the test is what stops it being re-added as an optimisation.
      (Req: commit-gates — A turn that commits reports its gates before it
      ends, §*The turn commits and pushes before ending*)
- [ ] 2.4 Write the message-reading tests: a gate line ends the turn [16
      first half]; the words "gate line" in prose do not [16 second half];
      `BLOCKED` with what the user must settle ends the turn; a bare `BLOCKED`
      with nothing after it blocks; an empty message blocks [3]; a payload
      with no final assistant message ends the turn [21]. (Req: commit-gates —
      A turn that commits reports its gates before it ends, §*The turn reports
      its gates*, §*The turn names what only the user can settle*, §*A bare
      marker with nothing after it*, §*The final message cannot be read*)
- [ ] 2.5 Write `scripts/turn-gate.ts` against those tests, with both halves —
      the mark writer and the turn-end decision — in one file, since they are
      two ends of one contract and splitting them puts the mark's format in
      two places. Confirm it stays under the 300-line cap `change-slicing`
      sets. (Req: commit-gates — A turn that commits reports its gates before
      it ends)

## 3. Wiring, and the prose it supersedes

- [ ] 3.1 Write the exit-code and refusal tests: a block exits exactly 2 [14];
      the reason names running the sequence and writing `BLOCKED` [15]; a
      non-repository ends the turn [19]; a detached `HEAD` ends the turn [20];
      the 2026-08-19 shape — last task committed, message ending in a question
      — blocks [23]. (Req: commit-gates — A turn that commits reports its
      gates before it ends, §*A task group is completed and the turn ends
      silently*, §*There is no repository, or no branch*)
- [ ] 3.2 Register both hooks in `.claude/settings.json`, and confirm
      `agent-permissions.test.ts` still passes — it flattens
      `settings.hooks.PreToolUse` before asserting a length of one, so
      registrations on other events are outside what it pins.
      (Req: commit-gates — A turn that commits reports its gates before it
      ends)
- [ ] 3.3 Shorten `docs/review-toolkit.md`'s "never ask whether to run it" to
      what the hook cannot see: the hook reaches a turn that committed with a
      group complete, so what stays prose is the sequence's other trigger —
      any pull request that changes code — and the fact that a gate line is a
      report rather than proof. (Req: agent-rulebook — A mechanised
      prohibition leaves its prose home)
