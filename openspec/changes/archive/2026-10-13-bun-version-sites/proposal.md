# bun-version-sites

## Why

This change arrived from d2ass carrying two subjects, and only one of them is
the harness's. The other — a check reconciling the sites that state which bun
d2ass runs, its workflow inputs, `Dockerfile` tags and `@types/bun`, and the
`toolchain-pins` capability describing it — reads files the harness does not
have. `repoint-moved-changes` cut it out to the card *Reconcile the bun
version sites* on `D2ASS`, which carries what was decided and names the
commit that removed it here.

What stays is the description a check outgrew. `agent-permissions`
§*Every manifest-mutating invocation prompts* is normative in its first
sentence — every invocation form that changes the dependency record — and the
enumeration that follows promises `bun`'s documented aliases for the install
family alone. `bun/settings.ts` demands an entry for each alias the installed
bun documents for any gated command, which is why `bun up` is listed:
`bun update` carries that alias from 1.4.2 and none in 1.3.14, and the drift
that exposed it was a red merge in which two cases demanded opposite
permission lists. The policy was never in breach; the sentence describing it
was narrower than the check enforcing it, and a description a check has
outgrown is the next thing somebody reasons from.

## What Changes

- `agent-permissions` §*Every manifest-mutating invocation prompts* gains the
  alias clause its check already enforces: each documented alias of any gated
  command, not of the install family alone.
- The same requirement's claim that a broader `allow` from another source
  suppresses an `ask` prompt is replaced with the precedence Claude Code
  documents: `ask` prompts whatever `allow` also matches. Its scenario is
  inverted to match. OpenSpec refuses to drop a scenario from a modified
  requirement, so the delta removes the requirement and adds the corrected
  one whole as *Every manifest-mutating invocation prompts, whatever else
  allows it*. Every other scenario keeps its heading, so no citation moves.

## Non-goals

- **Reconciling the bun version sites.** That is d2ass's tree, on the `D2ASS`
  card named above.
- **Changing the gated surface.** `Bash(bun up *)` is already listed; this
  brings the description up to the check, not the check up to anything.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `agent-permissions`: the alias clause of *Every manifest-mutating invocation
  prompts* covers the documented alias of any gated command where it covered
  the install family's alone. The description is widened to what is already
  enforced.
- `agent-permissions`: the same requirement stops saying that a broader
  `allow` from another source suppresses an `ask` prompt. Claude Code's
  permissions reference, read on 2026-10-11, says the opposite: "Rules are
  evaluated in order: deny, then ask, then allow", and "a matching ask rule
  prompts even when a more specific allow rule also matches the same call".
  `core/verification.md` already reads the chain that way. Because this delta
  copies the requirement whole, archiving it unchanged would re-assert the
  false sentence.

## Impact

- `openspec/specs/agent-permissions/spec.md` — one requirement modified: a
  clause widened, and one false precedence claim and its scenario corrected.
  No gated surface changes.
- No code, settings or dependency change.
