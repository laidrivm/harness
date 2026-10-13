# turn-gate-pulled-commits — tasks

The test tasks come from the proposal-stage `/zombies` run and are written
before the code they cover (`core/testing.md`, TDD for edge cases). Bracketed
numbers are that run's idea numbers, and all 13 are placed below. Each case
that cites a scenario carries its `// spec:` line.

One group, which ships whole as one harness pull request on
`feat/turn-gate-pulled-commits`.

## 1. Groups that `origin/main` already holds complete do not count

- [x] 1.1 In `bun/turn-gate.fixture.ts`, add a helper that publishes the
      current tree as `origin`'s `main` and fetches it, so
      `refs/remotes/origin/main` exists. Leave `repo()` as it is, so every
      existing case still runs without that ref. That keeps them covering
      *A repository without origin/main* [1]. Verify: `bun test` stays green
      with the helper unused.
- [x] 1.2 Write `bun/turn-gate-pulled.test.ts`, driving `decide` with a
      `log` spy. Each case below fails before 1.3, except where the case says
      it passes today:
      - a fast-forward pull on `main` that completes a group, then a silent
        message: the turn ends [2] (spec: *A pull brings in another pull
        request's completed group*);
      - a fetch on `main` with `HEAD` left at the mark, where `origin/main`
        completes a group: the turn ends [3] (spec: *A fetch on main moves
        the tip to its remote-tracking ref*);
      - a turn on `feat` that commits and pushes its own group while
        `origin/main` holds it open: refused [4]. This passes today and pins
        that pushing to `feat` does not move the base;
      - a pull that brings in group A complete on `origin/main`, plus a
        commit of the turn's own completing group B: refused, the reason
        names B and does not name A [5] (spec: *The turn's own group beside
        a pulled one*);
      - `origin/main` merged into `feat` with nothing of the turn's own: the
        turn ends [6] (spec: *Main merged into a feature branch*);
      - the same merge plus the turn's own completed group: refused, naming
        only that group [7];
      - a change archived on `origin/main` that the tip holds active and
        complete: refused [8]. This passes today;
      - a change the mark lacks entirely, pulled in complete from
        `origin/main`: the turn ends [9];
      - a turn whose only completed groups came from `origin/main` never calls
        `log` [10];
      - the turn completes its group on `feat`, pushes it, publishes the same
        tree as `origin/main` and fetches: the turn ends [12] (spec: *A turn
        that merges its own pull request*);
      - a group completed on `origin/feat` by another clone and fetched with
        `HEAD` at the mark: refused once [13]. This passes today and pins the
        ceiling.
      Keep the file under its 300-line cap. (Req: commit-gates — A turn that
      commits reports its gates before it ends)
- [x] 1.3 Add one case to `bun/turn-gate-cli.test.ts`: the 2026-10-13
      orchestrator turn. A pull on `main` brings in a completed group, and the
      message has no gate line. The script exits 0 with an empty stderr
      [11]. It fails before 1.4. Add a case to
      `bun/turn-gate-turn.test.ts`, citing *A repository without
      origin/main*: with no `origin/main`, a turn completing its group is
      refused [1]. It passes today and pins the fallback.
- [x] 1.4 Export `BASE` from `bun/branch-state.ts` and import it in
      `bun/turn-gate.ts`. In `completed()`, read `<BASE>:<path>` in the same
      `git cat-file --batch` call as the mark and the tip, and add its
      complete groups to the set excluded at the mark. Update the doc comment
      on `completed()` and the module header so they name the third side.
      Verify: `bun test` is green, 1.2 and 1.3 included, and every file is
      under its cap.
- [x] 1.5 Grep `README.md`, `core/` and `openspec/specs/` for every passage
      that says which groups qualify a turn ("not complete at the mark",
      "completed a task group", "completes a task group"). Reconcile each one
      that this change makes false. On 2026-10-13 none was found, because each
      reads "the turn completes", which stays true. Verify: the grep and the
      reconciliation are in the pull request body.
