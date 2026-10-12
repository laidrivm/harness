# agent-autonomy — tasks

The test tasks come from the proposal-stage `/zombies` run and are written
before the doc and the markers they cover, following `core/testing.md` (TDD
for edge cases). The numbers in brackets are that run's idea numbers, and all
14 of them are placed below.

The change is one group and one harness pull request, on
`feat/agent-autonomy`. The pull request is taken only once the card-questions
change (harness#56) is on `main`.

## 1. The classes, the markers, and the vocabulary check

- [ ] 1.0 With harness#56 on `main`, add `after: [card-questions]` to this
      change's `.openspec.yaml`. Before that, the `after:` fails
      `board-state-hygiene.test.ts`, so the proposal does not carry it.
      `bun test` is green.
- [ ] 1.1 Write `bun/autonomy.test.ts` with these cases:
      - A file with no marker adds nothing [1].
      - A doc that defines no class fails, naming the doc [2].
      - One `agent` marker passes [3].
      - Two markers on one line are both validated [4].
      - A marker in a skill under `core/skills/` is scanned [5].
      - Of several markers in a file, only the one naming an unknown class is
        reported [6].
      - A marker wrapped after `(unattended:` is read [7].
      - `Agent` fails [8].
      - An empty class fails [9].
      - `` ### `agent-run` `` is not `agent` [10].
      - A fourth class heading fails [11].
      - `core/rules.md` links `autonomy.md`, and the link resolves [12].
      - `agnet` fails, naming the file [13].
      - The real tree passes [14].

      The cases build their fixture trees in a temporary directory, apart
      from [12] and [14], which read the repository. Each case fails before
      1.2.
      (Req: agent-autonomy — A step on the loop's critical path names its
      class where it stands, §*A marker names an unknown class*, §*A marker
      that wraps across a line*; Three classes say what an unattended session
      does at a step that names the user)
- [ ] 1.2 Write `core/autonomy.md`. It opens with a level-1 heading, and says:
      - When a session is unattended, and that an attended one follows each
        step as written.
      - The three classes as `` ### `agent` ``, `` ### `card` `` and
        `` ### `user` ``, each saying what an unattended session does.
        `card` cites the card-questions change's *A worker meets a question*
        and restates none of it.
      - That a step with no marker is `card`.
      - That a prompt naming a stage is the request the stage's command waits
        for.
      - The marker's form.

      Link it from `core/rules.md`, beside the line pointing at
      `verification.md`, and from `CLAUDE.md`'s list of docs. `bun test` is
      green, and `core/rules.md` stays far under its ~350-line trigger: give
      the count in the pull request. (Req: agent-autonomy — A session is
      attended unless the prompt that started it says otherwise; Three
      classes say what an unattended session does at a step that names the
      user)
- [ ] 1.3 Mark the steps in design.md's *The classification* for
      `core/feature-workflow.md`, `core/review-toolkit.md`, `core/rules.md`,
      `core/git-and-prs.md` and `core/code-style.md`. Each marker is inline,
      in the form `(unattended: <class> — <what instead>)`, at the sentence
      the table quotes. Find each sentence by its wording, and stop if one is
      no longer there, since the step has moved and its class needs reading
      again. `bun test` is green. (Req: agent-autonomy — A step on the loop's
      critical path names its class where it stands)
- [ ] 1.4 Mark the four gate-skill steps in the same table, in
      `core/skills/{zombies,warm,triage,coderabbit-local}/SKILL.md`. Leave
      `.claude/commands/opsx/` alone, as design.md *OpenSpec's commands are
      covered by a rule, not by edits* explains. `bun test` is green. (Req:
      agent-autonomy — A step on the loop's critical path names its class
      where it stands, §*An ask in an OpenSpec command with no marker*)
- [ ] 1.5 Grep `core/`, `README.md` and `openspec/specs/` for every site that
      says an unattended session or a sub-agent must wait for the user, or
      that defines the classes again, and reconcile each site with the doc.
      List any site in a follow-up's scope in the pull request rather than
      editing it. Read the cards *Run the board loop* and *Formalise /goal
      in harness sessions*, and report any prose there that restates how an
      unattended session is declared. (Req:
      agent-autonomy — Three classes say what an unattended session does at a
      step that names the user)
