# push-option-values — tasks

One group, shipped whole on `fix/push-option-values` (#86), which carried the
code before this change was written down.

## 1. Read a push option's value as a value

- [x] 1.1 Split a push's words as git's parser does in `bun/git-options.ts`
      (`pushWords`, with `--recurse-submodules` added to
      `PUSH_VALUE_OPTIONS`), have `checkPush` in `bun/command-guard.ts` test
      only the switches for force and ref-wide flags and only the operands for
      destinations, and cover both directions in
      `bun/command-guard-push-options.test.ts`: a value that reads like a switch
      is allowed, and a real switch beside a value still blocks with its id.
      (Req: agent-permissions — The git prohibitions are enforced by a hook)
