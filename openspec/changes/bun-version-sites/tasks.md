# bun-version-sites — tasks

One step, so this change ships whole on `feat/bun-version-sites`.

The `agent-permissions` delta modifies one requirement whole and so carries
eight criteria this change does not close, listed here so that the two sets
account for every criterion in the delta:
`a-broader-local-allow-entry-suppresses-the-prompt`, `adding-a-dependency`,
`the-same-command-through-its-alias`, `removing-a-dependency`,
`a-subcommand-that-edits-the-manifest-directly`,
`trusteddependencies-is-never-granted-silently`,
`a-read-only-sibling-is-not-captured` and
`settings-carry-no-unreachable-ask-rule`. They describe the gated surface,
which no task here touches.

## 1. The alias clause the check outgrew

Closes `agent-permissions/an-alias-outside-the-install-family`.

- [ ] 1.1 Widen the alias clause in the `agent-permissions` delta to every
      gated command, and confirm the policy already satisfies it —
      `Bash(bun up *)` is listed in `bun/settings.ts` and `bun/settings.ts`
      already reads the alias of every gated command from the installed bun,
      so this step changes a description and not a boundary
      (*an-alias-outside-the-install-family*)
- [ ] 1.2 Move the `bun-version-sites` card on `Harness` to `done`, and check
      it points at the `D2ASS` card *Reconcile the bun version sites* for the
      part this change no longer carries
- [ ] 1.3 Measure every capped file this change touched and record the
      numbers, whether or not any is over
      (*change-slicing/a-file-over-the-cap*)
