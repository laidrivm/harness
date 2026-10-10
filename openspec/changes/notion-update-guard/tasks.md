# notion-update-guard — tasks

Test tasks come from the proposal-stage `/zombies` run and are written before
the code they cover (`core/testing.md`, TDD for edge cases). Bracketed numbers
are that run's idea numbers, and all 25 are placed below. Each spawned case
gets an environment built from what the case needs, in a directory that holds
no `.env`.

Two groups. Group 1 is one harness pull request on
`feat/notion-update-guard-1`. Group 2 is one change in each consumer, made in
the pull request that bumps its pin past group 1.

## 1. The guard, its registration and the check

- [ ] 1.1 Write `bun/notion-guard.test.ts`, spawning `bun/notion-guard.ts` with
      an event on stdin:
      - let through: no `properties` [1], `{}` [2], `null` [3],
        `update_properties` with properties [5], and `icon` and `cover` beside
        `update_content` [11];
      - refused with exit 2: properties under `update_content` [4],
        `insert_content` [6], `replace_content` [7] and `apply_template` [8],
        with no `command` [9], as a string [10], and under
        `Update_Properties` [12];
      - the refusal's stderr names `update_properties` [13], and its stdout
        is empty [14];
      - exit 0 on a stdin that is not JSON [19] and on an event with no
        `tool_input` [20].
      Every refusal case fails before 1.3. (Req: task-board — A card write
      that would lose its properties is refused)
- [ ] 1.2 Write the check's cases where `policy-gate-beyond-bash`'s split put
      them, or in a new `bun/settings-notion.test.ts` if that split has not
      landed. Never grow `bun/settings.test.ts` past its cap. Cases:
      - a consumer without the registration fails, naming it [22];
      - one whose command ends in `|| exit 2` fails [21];
      - one whose matcher differs fails [23].
      Also add a test that the exported matcher accepts both server names
      [15, 16] and rejects a longer tool name [17] and a sibling tool [18].
      These pin the string; 2.3 confirms that Claude Code applies it. All of
      these fail before 1.3. (Req: task-board — A card write that would lose
      its properties is refused, §*A consumer without the registration*)
- [ ] 1.3 Write `bun/notion-guard.ts`, fail-open as design.md *Fail-open*
      says. Add the registration text and the matcher to `bun/bootstrap.ts`,
      with no `|| exit 2`. Pin both in `bun/settings.ts`, and register the
      guard in this repository's `.claude/settings.json`. `bun test` must be
      green, with every file under its cap.
- [ ] 1.4 If `bun/gate-ledger.ts` is on `main`, record each refusal under
      `notion-properties-dropped` and add the case that a refusal appends that
      record [25]. Also add the case that an unwritable ledger still refuses
      with its reason [24]. If the module is not on `main` yet, leave this
      box open and say so in the pull request. Nothing else in the group
      waits on it.
- [ ] 1.5 In `core/feature-workflow.md`, shorten "Set a card's status and
      pointer with `update_properties`, and re-fetch the card before reporting
      it moved" to the re-read the hook cannot do, per agent-rulebook's
      *A mechanised prohibition leaves its prose home*. Grep for every other
      place that states the `update_properties` rule and reconcile each one.
      The README's *Consuming* section names the new registration beside the
      turn gate's.

## 2. Each consumer

- [ ] 2.1 dota2: bump the pin to group 1's merge commit, run `bun install`, and
      confirm that the lockfile names `harness` once. Add the registration
      from `bun/bootstrap.ts` and refresh `harness/` with `sync.ts`, all in
      one commit. `harness:check` must be green.
- [ ] 2.2 mellon: the same steps.
- [ ] 2.3 In a session started after 2.1 merges, move a dota2 card using
      `update_content` with `properties`, and confirm the call is refused
      with the hook's reason. Confirm that `update_properties` goes through.
      If the refusal does not happen, the matcher is not applied as the
      hooks reference says: stop and report before 2.2 merges.
