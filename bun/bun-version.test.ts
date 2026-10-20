/**
 * Every site that names the bun the harness runs on agrees: the cloud setup
 * script in README's *Cloud sessions*, each tracked workflow's `bun-version`,
 * and the bump workflow README gives. Nothing updates them but a hand edit,
 * so a bump that misses one fails here (cloud-sessions D4).
 */
import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const EXACT = /^\d+\.\d+\.\d+$/;
const SETUP = /npm i -g bun@([^\s`'"]+)/;
const PINNED = /^\s*bun-version:\s*["']?([^"'\s]+)["']?\s*$/gm;

/** Each problem with `root`'s bun sites, as a line naming what and where. */
function problems(root: string): string[] {
	const readme = existsSync(join(root, "README.md")) ? readFileSync(join(root, "README.md"), "utf8") : "";
	const setup = readme.match(SETUP)?.[1];
	const found: string[] = [];
	if (!setup || !EXACT.test(setup)) found.push("README.md holds no setup script line installing bun at an exact version");
	const dir = join(root, ".github/workflows");
	const workflows = existsSync(dir) ? readdirSync(dir).filter((name) => /\.ya?ml$/.test(name)).sort() : [];
	const sites: [string, string][] = [];
	for (const name of workflows)
		for (const [, version] of readFileSync(join(dir, name), "utf8").matchAll(PINNED))
			sites.push([`.github/workflows/${name}`, version ?? ""]);
	if (sites.length === 0) found.push("no tracked workflow names a bun-version");
	for (const [, version] of readme.matchAll(PINNED)) sites.push(["README.md", version ?? ""]);
	if (setup) sites.unshift(["README.md (setup script)", setup]);
	if (new Set(sites.map(([, version]) => version)).size > 1)
		found.push(`the bun sites disagree: ${sites.map(([site, version]) => `${site} ${version}`).join(", ")}`);
	return found;
}

const made: string[] = [];
afterAll(() => {
	for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

/** A tree whose README holds `readme` and whose workflows are `workflows`. */
function tree(readme: string, workflows: Record<string, string>): string {
	const root = mkdtempSync(join(tmpdir(), "harness-bun-version-"));
	made.push(root);
	writeFileSync(join(root, "README.md"), readme);
	mkdirSync(join(root, ".github/workflows"), { recursive: true });
	for (const [name, text] of Object.entries(workflows)) writeFileSync(join(root, ".github/workflows", name), text);
	return root;
}

const step = (version: string) => `      - uses: oven-sh/setup-bun@v2\n        with:\n          bun-version: ${version}\n`;
const SETUP_LINE = "Setup script: `npm i -g bun@1.4.2`.\n";

describe("the bun version sites", () => {
	// spec: cloud-sessions/a-site-the-test-cannot-find
	test("a README with no setup script line fails, naming it [39]", () => {
		expect(problems(tree("", { "test.yml": step("1.4.2") }))).toEqual([
			"README.md holds no setup script line installing bun at an exact version",
		]);
	});

	// spec: cloud-sessions/a-site-the-test-cannot-find
	test("no workflow naming a bun-version fails, naming it [40]", () => {
		expect(problems(tree(SETUP_LINE, { "test.yml": "on: push\n" }))).toEqual(["no tracked workflow names a bun-version"]);
	});

	// spec: cloud-sessions/every-site-agrees
	test("every site at one version passes [41]", () => {
		const readme = `${SETUP_LINE}\`\`\`yaml\n${step("1.4.2")}\`\`\`\n`;
		expect(problems(tree(readme, { "a.yml": step("1.4.2"), "b.yaml": step("1.4.2") }))).toEqual([]);
	});

	// spec: cloud-sessions/a-bump-misses-a-site
	test("two workflows that disagree fail, naming each [42]", () => {
		const [line] = problems(tree(SETUP_LINE, { "a.yml": step("1.4.2"), "b.yml": step("1.5.0") }));
		expect(line).toContain(".github/workflows/a.yml 1.4.2");
		expect(line).toContain(".github/workflows/b.yml 1.5.0");
	});

	test.each(["bun@1.4", "bun@latest"])("`npm i -g %s` is no exact version [43]", (spec) => {
		expect(problems(tree(`Setup script: \`npm i -g ${spec}\`.\n`, { "test.yml": step("1.4.2") }))[0]).toBe(
			"README.md holds no setup script line installing bun at an exact version",
		);
	});

	test("a quoted bun-version is read [44]", () => {
		expect(problems(tree(SETUP_LINE, { "a.yml": step('"1.4.2"'), "b.yml": step("'1.4.2'") }))).toEqual([]);
	});

	// spec: cloud-sessions/a-bump-misses-a-site
	test("a README bump snippet a bump missed fails, naming README.md and both versions [45]", () => {
		const [line] = problems(tree(`${SETUP_LINE}${step("1.4.1")}`, { "test.yml": step("1.4.2") }));
		expect(line).toContain("README.md 1.4.1");
		expect(line).toContain("1.4.2");
	});

	// spec: cloud-sessions/every-site-agrees
	test("the harness's own tree agrees", () => {
		expect(problems(join(import.meta.dir, ".."))).toEqual([]);
	});
});
