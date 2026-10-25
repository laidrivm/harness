import { afterAll, beforeAll, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { draftWhile } from "./ci-run-draft.ts";
import { cleanup, emptyDir } from "./diff-budget.fixture.ts";

/** A work that throws, against a `gh` that refuses `pr ready` or takes it; the flow's own cases are in `ci-run.test.ts`. */

const path = process.env.PATH;
let refusing = "";
let taking = "";
beforeAll(() => {
	refusing = emptyDir("ci-run-draft-refusing-");
	writeFileSync(join(refusing, "gh"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
	taking = emptyDir("ci-run-draft-taking-");
	writeFileSync(join(taking, "gh"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
});
afterAll(() => {
	process.env.PATH = path;
	cleanup();
});

const thrown = (dir: string) => {
	process.env.PATH = `${dir}:${path}`;
	return draftWhile("o/r", 7, () => Promise.reject(new Error("the work broke"))).then(
		() => "",
		(e: Error) => e.message,
	);
};

test("a work that throws keeps its error when the ready goes through", async () => {
	expect(await thrown(taking)).toBe("the work broke");
});

test("a work that throws names the pull request beside its error when the ready is refused", async () => {
	expect(await thrown(refusing)).toBe("the work broke; #7 could not be marked ready");
});

// A synchronous spawn blocks bun's own timer, hence the explicit limit and a hang shorter than it.
test("a gh that never answers is killed at the read limit and reads as refused", async () => {
	const hanging = emptyDir("ci-run-draft-hanging-");
	writeFileSync(join(hanging, "gh"), "#!/bin/sh\nexec sleep 10\n", { mode: 0o755 });
	process.env.HARNESS_GH_TIMEOUT_MS = "300";
	const started = Date.now();
	const message = await thrown(hanging).finally(() => delete process.env.HARNESS_GH_TIMEOUT_MS);
	expect([message, Date.now() - started < 5000]).toEqual(["the work broke; #7 could not be marked ready", true]);
}, 30_000);
