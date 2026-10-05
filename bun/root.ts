/**
 * The root of the repository a gate is run in: the consumer's, found from the
 * working directory. Never this file's own location, which in a consumer is
 * `node_modules/harness/bun/` — the package, not the project the gate checks.
 *
 * A seventh derivation stays where it is, in `mutation-floor-cli.test.ts`: it
 * is the expectation a case checks this resolution against, and a case that
 * took it from here would move with the defect it exists to catch.
 */
const top = Bun.spawnSync(["git", "rev-parse", "--show-toplevel"]);
if (top.exitCode !== 0) throw new Error(top.stderr.toString());

// Only the terminator git adds, not `trim()`: a repository whose path ends in a
// space is unusual and not this module's to corrupt.
export const root = top.stdout.toString().replace(/\n$/, "");
