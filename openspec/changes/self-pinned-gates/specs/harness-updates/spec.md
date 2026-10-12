# harness-updates — delta spec

## ADDED Requirements

### Requirement: The harness's own sessions run its gates from its pin

The harness's own tracked `.claude/settings.json` SHALL register every hook
the harness gives a consumer, with the text it gives the consumer, and SHALL
register no hook that runs a script from the harness's working tree. Its
sessions SHALL therefore run the gates from the harness's own pinned install,
a commit merged to `main`, so that an edit to a gate's source changes no
gate holding the session that made it. The pin SHALL be a development
dependency, so that a consumer installing the harness installs no second copy
of it. The stale-install notice SHALL read a pin held as a development
dependency when no runtime dependency names one, and SHALL prefer the runtime
dependency when both do.

The harness's test run SHALL fail when its settings lack one of those
registrations or carry a hook that runs a working-tree script.

#### Scenario: A gate edited in the working tree does not hold the session

- **WHEN** the harness is installed at its pin and a session's working tree
  replaces `bun/command-guard.ts` with a script that allows everything
- **THEN** a `git commit` on `main` is still refused by the registered hook,
  because the hook runs the pinned copy

#### Scenario: A registration is missing from the harness's settings

- **WHEN** the harness's settings lack the command of one hook the harness
  gives consumers, under that hook's event and matcher
- **THEN** the harness's test run fails, naming the hook

#### Scenario: A hook runs a working-tree script

- **WHEN** any hook in the harness's settings runs a script under
  `$CLAUDE_PROJECT_DIR/bun/`
- **THEN** the harness's test run fails, naming the hook

#### Scenario: A consumer installs one copy of the harness

- **WHEN** a consumer installs the harness from git at a commit whose
  manifest pins the harness as a development dependency
- **THEN** one package is installed, and the consumer's tree holds no nested
  copy of the harness

#### Scenario: The notice reads a development-dependency pin

- **WHEN** a session starts in a project whose only pin is a development
  dependency, with the harness installed from a different commit
- **THEN** the notice prints the line naming both commits and `bun install`

#### Scenario: A runtime pin is preferred

- **WHEN** a project pins the harness both as a runtime and as a development
  dependency, at different commits
- **THEN** the notice compares the install with the runtime pin
