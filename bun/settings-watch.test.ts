/**
 * The flake watch's registrations in a consumer's settings: present on both
 * events, under matcher `Bash`, with nothing that narrows or detaches them.
 * Beside `settings.test.ts`, which the loop guard's cases already fill to its
 * cap.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { settings } from "./settings.ts";
import { changed, cleanup, consumer } from "./settings.fixture.ts";

afterAll(cleanup);

type Group = { matcher?: string; hooks: object[] };

const report = (change: (hooks: Record<string, Group[]>) => void) =>
	settings(consumer(changed((c) => change(c.hooks as Record<string, Group[]>)))).join("\n");

/** The policy's one group on `event` that holds the watch. */
const group = (hooks: Record<string, Group[]>, event: string) => {
	const found = (hooks[event] ?? []).filter((g) => JSON.stringify(g).includes("flake-watch.ts"));
	expect(found).toHaveLength(1);
	return found[0] as Group;
};

const named = (event: string) =>
	`the ${event} hook is not the harness flake watch — run bun node_modules/harness/bun/sync.ts`;

describe("the flake watch's registrations", () => {
	// spec: flaky-tests/a-consumer-without-the-watch
	test.each(["PostToolUse", "PostToolUseFailure"])(
		"missing on %s is named, with the command that writes it [38]",
		(event) => {
			const text = report((hooks) => {
				const gone = group(hooks, event);
				hooks[event] = hooks[event]?.filter((g) => g !== gone) ?? [];
			});
			expect(text).toContain(named(event));
		},
	);

	// spec: flaky-tests/a-registration-narrowed-by-if
	test.each([
		["narrowed by `if` [39]", { if: "Bash(bun test *)" }],
		["run in the background [40]", { async: true }],
	])("a registration %s is named", (_, departure) => {
		const text = report((hooks) => {
			const narrowed = group(hooks, "PostToolUse");
			narrowed.hooks = [{ ...narrowed.hooks[0], ...departure }];
		});
		expect(text).toContain(named("PostToolUse"));
	});

	test("a registration moved to a group with no matcher is named [41]", () => {
		const text = report((hooks) => {
			delete group(hooks, "PostToolUseFailure").matcher;
		});
		expect(text).toContain(named("PostToolUseFailure"));
	});
});
