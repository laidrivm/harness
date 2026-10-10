# bun-version-sites — tasks

One step, so this change ships whole on `feat/bun-version-sites`.

The `agent-permissions` delta modifies one requirement whole and so carries
seven criteria this change does not close, listed here so that the two sets
account for every criterion in the delta: `adding-a-dependency`,
`the-same-command-through-its-alias`, `removing-a-dependency`,
`a-subcommand-that-edits-the-manifest-directly`,
`trusteddependencies-is-never-granted-silently`,
`a-read-only-sibling-is-not-captured` and
`settings-carry-no-unreachable-ask-rule`. They describe the gated surface,
which no task here touches.

## 1. The alias clause the check outgrew

Closes `agent-permissions/an-alias-outside-the-install-family` and
`agent-permissions/a-broader-local-allow-entry-does-not-suppress-the-prompt`.

- [ ] 1.1 Widen the alias clause in the `agent-permissions` delta to each
      alias bun documents for any gated command, and confirm the policy
      already satisfies it — `bun/settings.ts` already demands
      `Bash(bun up *)` among the gated forms and reads each gated command's
      documented alias from the installed bun, and `.claude/settings.json`
      lists it, so this step changes a description and not a boundary
      (*an-alias-outside-the-install-family*)
- [ ] 1.2 Move the `bun-version-sites` card on `Harness` to `done`, and check
      it points at the `D2ASS` card *Reconcile the bun version sites* for the
      part this change no longer carries
- [ ] 1.3 Measure every capped file this change touched and record the
      numbers, whether or not any is over
      (*change-slicing/a-file-over-the-cap*)
- [ ] 1.4 Confirm the corrected precedence where it is observed, not from
      inside the session. In a session started after `Bash(bun *)` is added to
      `.claude/settings.local.json` under `permissions.allow`, the user asks
      for `bun add preact` and reports whether a prompt appeared. The prompt
      is what the scenario promises; the agent cannot tell an approved prompt
      from no prompt (`core/verification.md`). Remove the entry afterwards.
      If no prompt appears, stop and report before archive: the reference
      and the behaviour disagree, and the requirement then states the
      behaviour (*a-broader-local-allow-entry-does-not-suppress-the-prompt*)
