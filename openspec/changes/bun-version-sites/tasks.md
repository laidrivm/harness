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

- [x] 1.1 Widen the alias clause in the `agent-permissions` delta to each
      alias bun documents for any gated command, and confirm the policy
      already satisfies it — `bun/settings.ts` already demands
      `Bash(bun up *)` among the gated forms and reads each gated command's
      documented alias from the installed bun, and `.claude/settings.json`
      lists it, so this step changes a description and not a boundary
      (*an-alias-outside-the-install-family*)
- [ ] 1.2 Move the `bun-version-sites` card on `Harness` to `done`, and check
      it points at the `D2ASS` card *Reconcile the bun version sites* for the
      part this change no longer carries
- [x] 1.3 Measure every capped file this change touched and record the
      numbers, whether or not any is over
      (*change-slicing/a-file-over-the-cap*). Measured: none touched. The
      cap covers `.ts`, `.tsx` and `.css`, and this change writes none — only
      its own artefacts here and, at archive,
      `openspec/specs/agent-permissions/spec.md`
- [x] 1.4 Confirm the corrected precedence where it is observed, not from
      inside the session. In a session started after `Bash(bun *)` is added to
      `.claude/settings.local.json` under `permissions.allow`, the user asks
      for `bun add preact` and reports whether a prompt appeared. The prompt
      is what the scenario promises; the agent cannot tell an approved prompt
      from no prompt (`core/verification.md`). Remove the entry afterwards.
      If no prompt appears, stop and report before archive: the reference
      and the behaviour disagree, and the requirement then states the
      behaviour (*a-broader-local-allow-entry-does-not-suppress-the-prompt*).
      Observed on 2026-10-12 through another allow source and tool rather
      than this exact pair: a fresh session launched with
      `--allowedTools "mcp__claude_ai_Gmail__send_message"` still prompted
      on the `ask` entry `mcp__*__send_message`, recorded as task 1.6 of
      `policy-gate-beyond-bash` in harness PR #69. The permissions reference,
      re-read on 2026-10-13, states the order with no exception by source:
      "Rules are evaluated in order: deny, then ask, then allow", and "a
      matching ask rule prompts even when a more specific allow rule also
      matches the same call"
