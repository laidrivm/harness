# bot-reads-rulebook — design

## Context

What was measured on 2026-10-12, with CodeRabbit CLI 0.7.0:

- **The PR bot already reviews the harness.** `coderabbitai[bot]` posted on
  each of pull requests 47 to 51, and nothing is tracked to configure it.
- **What the bot reads by default.** docs.coderabbit.ai's code-guidelines
  page lists the patterns read with no configuration, and `**/CLAUDE.md` is
  among them. The page says configured `filePatterns` "are added on top of
  the defaults — they do not replace them". It says nothing on whether an
  `@` import inside `CLAUDE.md` is followed. The harness's `CLAUDE.md` holds
  only `@core/rules.md` and links, so nothing beyond that file is known to
  reach the bot.
- **What the CLI documents.** The CLI's overview says that "without explicit
  `--config` files" a local review looks for `.coderabbit.yaml` on its own.
  `--config` takes "additional instructions … (e.g., claude.md,
  coderabbit.yaml)". Neither page says whether a config passed that way has
  its `code_guidelines` patterns resolved.
- **`--show-prompts` cannot answer that.** The current requirement relies on
  it, but `coderabbit review --show-prompts` in mellon replayed "1 AI prompt
  from your last review" — the fix prompt of one finding at
  `harness/feature-workflow.md:124` — and not the instructions the review was
  given. d2ass and the harness had no saved prompts at all.
- **Which files the patterns match.** In the harness, `git ls-files
  ':(glob)core/*.md'` lists 9 files and `git ls-files 'core/*.md'` lists 34,
  because a plain pathspec's `*` crosses `/` and so takes in every
  `core/skills/**/*.md`. In d2ass the config's three patterns match
  `CLAUDE.md` (2,617 bytes), `docs/*.md` (2 files, 4,613 bytes) and
  `harness/*.md` (9 files, 57,645 bytes). mellon has no `.coderabbit.yaml`.

## Goals / Non-Goals

**Goals:**

- The harness's PR bot and its local review both read `core/rules.md` and the
  docs beside it.
- The sentence in `core/rules.md` holds in every tree that carries it.

**Non-Goals:**

- Anything in d2ass's config beyond `code_guidelines` (see proposal.md §Non-goals).
- Asserting what CodeRabbit does with the files once it has read them. The
  test pins only what the repository controls: that the patterns name the
  files.

## Decisions

### `core/*.md`, flat, and nothing else

The only configured pattern is `core/*.md`. `**/CLAUDE.md` is a default and
naming it again restates CodeRabbit's list. `docs/*.md` matches nothing in the
harness: `docs/` holds only `docs/context/`, whose save-points are never meant
to load automatically. The glob is flat so that `core/skills/**` stays out:
those files are prompts for an agent, and a reviewer reading them as rules
would quote a skill's step as if it were a rule of the project. d2ass made
the same choice for the same reason. *Alternative:* `core/**/*.md`, which
would take in 25 skill files and the vendored `playwright-cli` references.

### A harness test, not a check shipped to consumers

The pin lives in a harness test, `bun/review-config.test.ts`, and not in
`bun/check.ts`. A consumer check would apply the same contract to
`harness/*.md`, and mellon would fail it on its first run, since it has no
config. That is a new gate with its own rollout, so it gets its own card
(proposal.md §Non-goals). The test reads the config with `Bun.YAML.parse`,
which `bun/check-yaml.ts` already uses, and matches patterns with `Bun.Glob`,
whose `*` stops at `/` just as the bot's does. It takes the docs from the
structure of `CLAUDE.md` and `core/rules.md` themselves: their relative
markdown links and `CLAUDE.md`'s `@` import lines. It never keeps a list of
them, because a list would be a second copy that drifts. The scan names its
one exemption, `README.md`, and gives the reason beside it. `CLAUDE.md` links
the README for the package layout, which holds no rule. A scan scoped to
`core/` would instead pass in silence once a doc moved out of it, and that
move is the very thing the test exists to catch.

### The local invocation passes what the patterns match

Whether the CLI resolves `code_guidelines` from a config passed with
`--config` is undocumented, and the one check the spec names cannot observe
it. Passing the matched files explicitly is right either way: if the CLI
already resolves them, the cost is a duplicate. The skill expands each
pattern with `git ls-files ':(glob)<pattern>'`, because a plain pathspec
matched 34 files where the bot matches 9, and `git ls-files` goes into the
skill's `allowed-tools`. *Alternative:* name `core/rules.md` alone. That would
miss the indexed docs, which `core/rules.md` §*The loop* treats as a home for
a rule equal to the rulebook itself.

### Two steps

Step 1 closes the three criteria of the bot-config requirement. Step 2 closes
the three criteria of the invocation requirement that replaces the alignment
requirement. The replacement is a removal plus an addition rather than a
modification, because OpenSpec refuses a MODIFIED block that drops scenarios.
Dropping three of them is the point here: their check is the one
`--show-prompts` cannot run. Together they come to
six, over the three per step that `change-slicing` §*A step closes one to
three acceptance criteria* allows. They also touch different things: the PR
bot's config is one, and a skill every consumer runs is the other. The
justification requirement changes its wording only. Its two scenarios keep
their headings, and no step closes them.

### The prose names no glob

`core/rules.md` reaches each consumer as `harness/rules.md`, so any glob it
names is wrong in at least one tree. The reworded sentence makes no claim
about any config. It says a rule is read back wherever the repository's
`.coderabbit.yaml` names the paths the rulebook and its docs sit at. That is
the case in the harness once step 1 lands, and in d2ass today. In mellon the
condition is unmet until the mellon card lands, and no claim it makes there is
false. The README line about a consumer's copy states the same condition from
the consumer's side.

## Risks / Trade-offs

- [The local review now carries about 58 KB more instructions in the harness
  and about 62 KB more in d2ass] → Step 2 runs one review in the harness and
  records whether the CLI accepted the list. If it refuses, the step stops and
  reports rather than trimming the list, because a trimmed list is the
  misalignment this change removes.
- [CodeRabbit changes its default patterns and drops `**/CLAUDE.md`] → The
  test pins the docs and the rulebook, not `CLAUDE.md`. `CLAUDE.md` would
  fall out unseen. This is accepted: the dependency on the default is stated
  here, and naming the file would restate a list the vendor owns.
- [mellon's rules go unread by its bot] → They already do today. After this
  change the rulebook says so instead of denying it, and the mellon card
  closes the gap.

## Migration Plan

None. Consumers receive the reworded sentence and the skill change on their
next harness bump. d2ass's config already names `harness/*.md`, so its local
review starts passing those files with no edit on its side.
