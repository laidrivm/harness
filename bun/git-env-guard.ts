/**
 * Preloaded by the harness's `bunfig.toml`: refuses the whole suite, before
 * any test file loads, while a variable `git rev-parse --local-env-vars`
 * names is set — empty included — since each fixture's git would follow it
 * into another repository. Refusing rather than deleting them: a
 * `Bun.spawnSync` without `env` takes the environment the process started
 * with, which no edit of `process.env` reaches. A list it cannot read
 * refuses too.
 */

const READ = "git rev-parse --local-env-vars";

function refuse(why: string): never {
	process.stderr.write(`git-env-guard: refusing to run the suite: ${why}\n`);
	process.exit(1);
}

let names: string[] = [];
try {
	const run = Bun.spawnSync(READ.split(" "), { timeout: 10_000 });
	if (run.exitCode !== 0)
		refuse(`\`${READ}\` exited ${run.exitCode}: ${run.stderr.toString().trim()}`);
	names = run.stdout.toString().split("\n").filter(Boolean);
} catch (error) {
	refuse(`\`${READ}\` failed: ${error instanceof Error ? error.message : String(error)}`);
}
if (names.length === 0) refuse(`\`${READ}\` printed no variable`);

const set = names.filter((name) => process.env[name] !== undefined);
if (set.length > 0)
	refuse(
		`${set.join(", ")} set — git's repository variables would send each fixture's git into another repository; unset them first`,
	);
