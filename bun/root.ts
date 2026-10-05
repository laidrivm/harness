/**
 * The repository root, for the files in `scripts/` that read artefacts of it.
 *
 * One module rather than the line each of them carried: it stood in six copies
 * under two names — `root` and `repo`, the second of which also read as the
 * throwaway repositories its own file fabricates — and three spellings, one of
 * them inlined into its single use.
 *
 * A seventh derivation stays where it is, in `mutation-floor-cli.test.ts`: it
 * is the expectation a case checks this resolution against, and a case that
 * took it from here would move with the defect it exists to catch.
 *
 * Anchored to this directory rather than imported from `checks/root.ts`, which
 * answers the same value today: each module resolves through its own location,
 * so moving one directory cannot silently point the other's callers at a tree
 * that is not the repository.
 */
import { join } from "node:path";

export const root = join(import.meta.dir, "..");
