---
name: code-review
description: Code review staged changes or a specific area of the codebase, optionally delegating to a chosen agent. Use when the user wants a code review.
argument-hint: "[agent] [feature]"
disable-model-invocation: true
allowed-tools: "Bash(git diff:*), Bash(git log:*), Bash(codex:*), Bash(aider:*), Bash(goose:*), Read, Write, Grep, Glob, Agent"
---

# Code Review

## Context

**Staged diff:**

!`git diff --cached`

**Recent commits (for context):**

!`git log --oneline -10`

## Arguments

Raw arguments: $ARGUMENTS

Parse the arguments as follows:

- **Agent** (optional, first argument): must be one of exactly these literals — `claude`, `self`, `codex`, `aider`, `goose`. Anything else is not an agent.
  - `claude` / `self` / empty — perform the review directly in this context (default)
  - `codex` / `aider` / `goose` — delegate via Bash (see Delegation section)
- **Feature** (optional, remaining arguments after agent): A description of what part of the codebase to review (e.g. "voting functionality", "authentication", "API endpoints"). When provided, find and review all files related to this feature. When empty/omitted, review staged changes instead.

If the first argument is not one of those five literals, treat the whole of `$ARGUMENTS` as the **feature**, with agent defaulting to `claude`. Never derive a command name from `$ARGUMENTS`.

## Instructions

### Determine what to review

1. **If a feature is specified** — use Glob and Grep to find all files related to the described feature. Read those files and review them as existing code.
2. **If no feature is specified and there are staged changes** — review the staged diff shown above.
3. **If no feature is specified and there are NO staged changes** — tell the user: "Nothing to review. Either stage changes with `git add` or specify a feature to review, e.g. `/code-review voting functionality`." Then stop.

### Perform the review

Read surrounding source files as needed to understand context. Organize findings by file, then by severity.

### Severity levels

The same four levels CodeRabbit uses, high to low — one vocabulary across every review skill here, so a finding keeps its label whether it came from the bot or from this review:

1. **🔴 Critical** — Security vulnerabilities, data loss risks, crashes. Must be fixed.
2. **🟠 Major** — Logic errors, missing error handling, broken edge cases. Very likely to cause problems.
3. **🟡 Minor** — Code smells, performance concerns, maintainability issues, better approaches, readability. Worth reading and deciding on.
4. **🔵 Trivial** — Style, naming, formatting, preferences. Totally optional.

Don't invent levels outside this ladder — no `Error`, `Warning`, `Suggestion` or `Nitpick`.

A fact about the environment the change lands in — repo conventions, a missing CI job, how downstream consumes it — is **not a defect in the change** and gets no severity. Say it under `## Summary` as an environment note, and let the verdict stand on the findings.

### Output format

Group findings by severity. Each severity level that has findings should be its own heading (e.g. `## 🔴 Critical`, `## 🟠 Major`, etc.). Number the findings sequentially across the whole report, never restarting per heading, so "fix 3 and 7" means exactly two findings. For each finding, include:
- The file and line reference
- A concise description of the issue
- A suggested fix or alternative (when applicable)

Omit severity headings that have no findings.

End with a `## Summary` section: overall assessment, whether changes look good to merge (or code looks healthy), and a count of findings per severity level.

### Delegation

Only for agent `codex`, `aider`, or `goose`:
- Write the prompt (review instructions, severity levels, output format, and the staged diff or feature description) to a file in the scratchpad directory using Write — never inline user text into the command line
- Run exactly one of: `codex -q "$(cat <prompt-file>)"`, `aider -q "$(cat <prompt-file>)"`, `goose -q "$(cat <prompt-file>)"`
- When the command returns, relay its findings to the user verbatim
