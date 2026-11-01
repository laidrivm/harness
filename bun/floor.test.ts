/**
 * What a count owes the floor a consumer declares, whichever floor it is: the
 * gap in each direction, the reason, and a floor or reason the check cannot
 * read. The callers' own cases bind it to `harness.mutationFloor` and
 * `harness.uncitedFloor`.
 */
import { describe, expect, test } from "bun:test";
import { type Floor, gauge } from "./floor.ts";

/** A floor of the shape both callers declare, under a key neither uses. */
const at: Floor = {
	key: "someFloor",
	field: "count",
	counted: "things",
	lower: "remove one",
};

const why = "measured";

/** What `gauge` returns for a floor whose one fault is `field`. */
const naming = (field: string) => [
	expect.stringContaining(`harness.someFloor.${field}`),
];

describe("the count against the floor", () => {
	test("a count equal to the floor passes", () => {
		expect(gauge(at, 7, 7, why)).toEqual([]);
	});

	test("a floor of zero with nothing counted passes", () => {
		expect(gauge(at, 0, 0, why)).toEqual([]);
	});

	test("a count above the floor names both numbers and the way down", () => {
		expect(gauge(at, 8, 7, why)).toEqual([
			"8 things against a floor of 7 — remove one, or raise the floor and say why",
		]);
	});

	test("a count below the floor names the value to write", () => {
		expect(gauge(at, 6, 7, why)).toEqual([
			"6 things against a floor of 7 — write 6 as the floor, so the gain is recorded",
		]);
	});
});

describe("the floor's reason", () => {
	test("an empty reason fails naming the field", () => {
		expect(gauge(at, 7, 7, "")).toEqual(naming("why"));
	});

	test("a reason of whitespace alone fails naming the field", () => {
		expect(gauge(at, 7, 7, " \t ")).toEqual(naming("why"));
	});

	test("an absent reason fails naming the field, rather than throwing", () => {
		expect(gauge(at, 7, 7, undefined)).toEqual(naming("why"));
	});

	test("a reason that is not text fails naming the field", () => {
		expect(gauge(at, 7, 7, ["measured"])).toEqual(naming("why"));
	});

	test("the reason is demanded whichever direction the number moved", () => {
		for (const count of [6, 7, 8])
			expect(gauge(at, count, 7, "")[0]).toContain("harness.someFloor.why");
	});
});

// spec: mutation-floor/a-floor-that-is-not-a-whole-number
// spec: spec-test-traceability/a-floor-that-is-not-a-whole-number
describe("a floor that is not a whole number", () => {
	test("a negative floor fails naming the field", () => {
		expect(gauge(at, 0, -1, why)).toEqual(naming("count"));
	});

	test("a floor written as a string fails naming the field, with no gap", () => {
		expect(gauge(at, 7, "7", why)).toEqual(naming("count"));
	});

	test("an absent floor fails naming the field", () => {
		expect(gauge(at, 7, undefined, why)).toEqual(naming("count"));
	});

	test("a fractional floor fails naming the field", () => {
		expect(gauge(at, 7, 7.5, why)).toEqual(naming("count"));
	});

	test("a floor and a reason both unreadable are both named", () => {
		expect(gauge(at, 7, null, undefined)).toEqual([
			...naming("why"),
			...naming("count"),
		]);
	});
});
