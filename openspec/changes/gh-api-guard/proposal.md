# gh-api-guard

## Why

The prohibition on publishing text under the user's name is enforced by
matching subcommand names — `gh pr comment`, `gh issue comment`, `gh pr
review` — in `permissions.deny` and again in `bun/command-guard.ts`'s
`GH_WRITES`. `gh api` reaches the same endpoints under a spelling neither
matches, so the boundary is currently held by the agent obeying prose.

Probed against the guard on `82948be`, with the three named writes as the
control, and again once steps 1 and 2 had merged (`600dddc`), with
`gh api /repos/o/r` exiting 0 as the control that the built guard still reads:

| command | guard on `82948be` | guard on `600dddc` |
| --- | --- | --- |
| `gh pr comment 1 --body hi` | exit 2, blocked | exit 2, blocked |
| `gh issue comment 1 --body hi` | exit 2, blocked | exit 2, blocked |
| `gh pr review 1 --approve` | exit 2, blocked | exit 2, blocked |
| `gh api -X POST /repos/o/r/issues/1/comments -f body=hi` | exit 0, allowed | exit 2, blocked |
| `gh api --method POST /repos/o/r/pulls/1/reviews -f event=APPROVE` | exit 0, allowed | exit 2, blocked |
| `gh api graphql -f query=mutation{addComment…}` | exit 0, allowed | exit 2, blocked |
| `gh api -X PATCH /repos/o/r/issues/comments/1 -f body=edited` | exit 0, allowed | exit 2, blocked |

`bash -c "gh api -X POST …"` passed too on `82948be`, where the wrapped form
of the named write is blocked — so the gap was in what the guard looks for,
not in how far it reaches. On `600dddc` it exits 2.

`gh api` is in no tracked permission list, so today it prompts like any
unlisted command and the user sees it. That is a prompt, not a boundary:
`core/git-and-prs.md` states the rule as absolute — *never* reply, comment or
review under the user's name — and a rule whose only enforcement is a prompt
the user may approve while reading something else is not the rule as written.

## What Changes

- The guard blocks a `gh api` invocation that cannot be shown to be a read,
  beside the subcommand pairs it already blocks. Both checks live in
  `bun/command-guard-gh.ts`, which the guard calls from its `gh` branch.
  `gh api --help` states the method: `GET` by default, and `POST` as soon as any parameter is
  added — so a read is a call whose `--method`/`-X` names `GET` or `HEAD`,
  whatever fields it carries, or one naming no method and carrying no
  parameter flag: `-f`, `-F`, `--field`, `--raw-field` or `--input`. Anything
  else is a write.
- The refusal names `gh api` and what made the call a write, so an author who
  meant to read sees which flag to drop.
- `openspec/specs/agent-permissions` §*GitHub write commands are denied* gains
  what the deny entries cannot express and the guard must therefore hold.
- `core/git-and-prs.md`'s prohibition narrows to what the mechanism still does
  not cover — a tracker, a forum, any service that is not GitHub — per
  `openspec/specs/agent-rulebook` §*A mechanised prohibition leaves its prose
  home*. A rewrite on the default branch took it there before this change's
  last step: the sentence now names the `gh` writes as refused and keeps only
  the channels no permission entry reaches.

## Non-goals

- **Blocking `gh api` reads.** The `coderabbit` skill's first step is three of
  them — the inline comments, the issue comments and the reviews of a pull
  request — and they are how a review is read at all. A change that stopped
  them would trade one gate for another.
- **A deny entry for `gh api`.** A permission pattern matches a prefix, so it
  can express `gh api` whole or nothing narrower: `Bash(gh api -X POST *)`
  misses `--method POST`, misses `-f` with no method at all, and misses the
  flag written after the path. The deny list stays the three subcommands and
  the guard stays the boundary, which is the division the modified requirement
  already describes.
- **Parsing a GraphQL document.** The guard reads an inline document's
  leading operation keyword and searches it for `mutation`, and no more: the
  `coderabbit` skill's review-thread read passes, and anything that could
  carry a write, or that the guard cannot see, is blocked.
- **Every other route to the same act.** `curl` against the GitHub API, a
  personal token in a script, the web UI. This change closes the route the
  repository's own tooling makes easy, and the prose keeps the rest.

## Capabilities

### New Capabilities

None. The boundary this widens is `agent-permissions`, and a capability of its
own would put a second specification over one guard.

### Modified Capabilities

- `agent-permissions`: the requirement that GitHub write commands are denied
  names three subcommands and the guard that catches their wrapped spellings.
  It gains the endpoint route — a `gh api` call that cannot be shown to be a
  read is blocked, and a read is not — because a prohibition matched by
  subcommand name does not reach a command that names no subcommand.

## Impact

- `bun/command-guard-gh.ts` — new, split out of `bun/command-guard.ts`,
  which stood at the file cap: the `GH_WRITES` pair search beside the
  `gh api` check, which reads the flags `gh api` takes rather than the path it
  addresses. The guard's `gh` branch calls both and passes each refusal its
  ledger id.
- `bun/command-guard-gh.test.ts` and `bun/command-guard-gh-api.test.ts` —
  new: the writes blocked, the reads passed, and the wrapped and compound
  forms; the `gh` cases move there from `bun/command-guard.test.ts`.
- `openspec/specs/agent-permissions/spec.md` — one requirement modified.
- `core/git-and-prs.md` — the prohibition loses the GitHub clause it no longer
  has to carry.
- `.claude/settings.json` — unchanged; see Non-goals.
- No dependency, workflow or runtime change, and nothing the application ships
  is touched.
