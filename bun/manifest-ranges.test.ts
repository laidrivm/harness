/**
 * What `ranges` reads as a set of versions and what it lets through.
 *
 * The manifests below are fabricated because the rule is: it answers for a
 * field this repository does not carry yet, and a case that could not have
 * come out the other way proves nothing about it. What a consumer's own
 * manifest says is a question for the consumer's check.
 */
import { describe, expect, test } from "bun:test";
import { ranges } from "./manifest-ranges.ts";

/**
 * A manifest holding `fields`, with the ones every real one carries — this
 * repository's own name among them, which carries a digit and so is what every
 * case below also asserts is not read as a version.
 */
const manifest = (fields: Record<string, unknown>) =>
	JSON.stringify({ name: "d2ass", private: true, type: "module", ...fields });

describe("a version naming a set rather than a version", () => {
	test.each([
		["a caret", "^6.16.0"],
		["a tilde", "~6.16.0"],
		["a comparator", ">=6.16.0"],
		["a disjunction", "6.16.0 || 6.17.0"],
		["a minor wildcard", "6.x"],
		["a bare wildcard", "*"],
		["a hyphen span", "6.16.0 - 6.17.0"],
		["a major on its own", "6"],
		["a major and minor", "6.16"],
	])("%s is named, with the field it sits in", (_, spec) => {
		const found = ranges(manifest({ dependencies: { qs: spec } }));

		expect(found).toEqual([
			`package.json: dependencies.qs is ${spec}, not one version`,
		]);
	});

	test("is reached inside a nested override", () => {
		// bun lets an override scope a version to one dependent, so the values
		// are not all at one depth — and the nested spelling is the one a scan
		// reading the top level alone would pass.
		const fields = { overrides: { ajv: { "fast-uri": "^3.1.6" } } };

		const found = ranges(manifest(fields));

		expect(found).toEqual([
			"package.json: overrides.ajv.fast-uri is ^3.1.6, not one version",
		]);
	});

	test("is named once per version, not once per manifest", () => {
		// Every other case here asserts a one-element list, which a scan keeping
		// the last match rather than collecting them would satisfy.
		const fields = {
			dependencies: { qs: "^6.16.0" },
			overrides: { "fast-uri": "~3.1.7" },
		};

		const found = ranges(manifest(fields));

		expect(found).toEqual([
			"package.json: dependencies.qs is ^6.16.0, not one version",
			"package.json: overrides.fast-uri is ~3.1.7, not one version",
		]);
	});

	test("is named in a field this scan was never told about", () => {
		// The property the exemption list buys: `peerDependencies` is nowhere in
		// this file, and a range in it is still caught.
		const found = ranges(manifest({ peerDependencies: { preact: "^10" } }));

		expect(found).toEqual([
			"package.json: peerDependencies.preact is ^10, not one version",
		]);
	});
});

describe("a Git specifier", () => {
	const commit = "0123456789abcdef0123456789abcdef01234567";

	test("the harness pinned to a full commit passes", () => {
		const fields = {
			dependencies: { harness: `github:laidrivm/harness#${commit}` },
		};

		expect(ranges(manifest(fields))).toEqual([]);
	});

	test("a manifest with no harness entry passes", () => {
		// The pin is admitted, not demanded: a manifest from before the harness
		// was added names no entry for this rule to read.
		const fields = { dependencies: { preact: "10.29.8" } };

		expect(ranges(manifest(fields))).toEqual([]);
	});

	test.each([
		["a 39-character hash", `#${commit.slice(1)}`],
		["a 41-character hash", `#${commit}0`],
		["an upper-case hash", `#${commit.toUpperCase()}`],
		["a branch", "#main"],
		["a tag", "#v1.0.0"],
		["no reference", ""],
	])("the harness pinned to %s is named", (_, reference) => {
		const spec = `github:laidrivm/harness${reference}`;

		const found = ranges(manifest({ dependencies: { harness: spec } }));

		expect(found).toEqual([
			`package.json: dependencies.harness is ${spec}, not github:laidrivm/harness#<40-hex commit>`,
		]);
	});

	test("the harness by bare shorthand is named", () => {
		// The one entry the shorthand cannot hide in: it is read by its key, and
		// every value but the pin fails there.
		const found = ranges(
			manifest({ dependencies: { harness: "laidrivm/harness" } }),
		);

		expect(found).toEqual([
			"package.json: dependencies.harness is laidrivm/harness, not github:laidrivm/harness#<40-hex commit>",
		]);
	});

	test.each([
		["pinned to a commit", `github:lodash/lodash#${commit}`],
		["on a branch", "github:lodash/lodash#main"],
		["over git+https", "git+https://github.com/lodash/lodash.git"],
		["over ssh", "git@github.com:lodash/lodash.git"],
		["by shorthand with a reference", `lodash/lodash#${commit}`],
	])("another dependency %s is named as a range is", (_, spec) => {
		const found = ranges(manifest({ dependencies: { lodash: spec } }));

		expect(found).toEqual([
			`package.json: dependencies.lodash is ${spec}, not one version`,
		]);
	});

	test("a hosted prefix other than github is named", () => {
		const found = ranges(
			manifest({ dependencies: { lodash: "gitlab:lodash/lodash" } }),
		);

		expect(found).toEqual([
			"package.json: dependencies.lodash is gitlab:lodash/lodash, not one version",
		]);
	});

	test("beside the pinned harness, only the other entry is named", () => {
		const fields = {
			dependencies: {
				harness: `github:laidrivm/harness#${commit}`,
				lodash: "github:lodash/lodash#main",
			},
		};

		expect(ranges(manifest(fields))).toEqual([
			"package.json: dependencies.lodash is github:lodash/lodash#main, not one version",
		]);
	});

	test("a package whose name ends in .harness is not the harness entry", () => {
		// Read by the key, not the path's tail, which this name shares.
		const fields = { dependencies: { "my.harness": "1.0.0" } };

		expect(ranges(manifest(fields))).toEqual([]);
	});

	test("a path with a slash passes", () => {
		// The bare shorthand's shape, which is why the shorthand without a
		// reference is the one Git form this scan lets through.
		expect(ranges(manifest({ module: "src/model.ts" }))).toEqual([]);
	});
});

describe("a value this scan has nothing to say about", () => {
	test.each(["10.29.8", "1.2.3-beta.1", "1.2.3+build.5"])(
		"the exact version %s passes",
		(spec) => {
			// A prerelease is still one version, and it carries the hyphen a span
			// is written with — which is why the span is recognised by the digit
			// after that hyphen rather than by the hyphen alone.
			expect(ranges(manifest({ dependencies: { qs: spec } }))).toEqual([]);
		},
	);

	test("a command carrying an operator passes, being exempt", () => {
		// Every shell operator this rejects in a version is ordinary in a script,
		// which is why the two fields are exempt rather than parsed.
		const fields = {
			scripts: { lint: "biome ci . || exit 1", dev: "bun x.ts >/dev/null" },
			"simple-git-hooks": { "pre-push": "bun test && echo x" },
		};

		expect(ranges(manifest(fields))).toEqual([]);
	});

	test("a reason among the consumer's harness values passes, being exempt", () => {
		// Prose, and prose opens with a tilde or a comparator as readily as a
		// range does.
		const fields = {
			harness: {
				mutationFloor: { surviving: 3, why: "~ half are equivalent" },
				diffBudgetExclude: ["*.woff2"],
			},
		};

		expect(ranges(manifest(fields))).toEqual([]);
	});

	test("a null passes rather than ending the scan", () => {
		// `typeof null` is `"object"` and `Object.entries(null)` throws, so the
		// guard against it is the difference between a clean manifest and a
		// check that cannot report on one.
		const fields = { dependencies: { qs: null, preact: "^10.29.8" } };

		expect(ranges(manifest(fields))).toEqual([
			"package.json: dependencies.preact is ^10.29.8, not one version",
		]);
	});

	test("a path carrying an x segment passes", () => {
		// Not every field this scan walks holds a version, and a wildcard read
		// wherever a dot precedes an `x` would refuse this one.
		const fields = {
			main: "./index.x.ts",
			dependencies: { preact: "10.29.8" },
		};

		expect(ranges(manifest(fields))).toEqual([]);
	});
});
