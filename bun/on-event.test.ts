import { afterAll, describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, emptyDir } from "./diff-budget.fixture.ts";
import { claim } from "./on-event.ts";

/** The event handler, run as the engine runs it. [n]: `ci-run-agent`'s `/zombies` items. */

afterAll(cleanup);

const HANDLER = join(import.meta.dir, "on-event.ts");
const SECRET = "s3cret-of-the-webhook";
const DELIVERY = "72d3162e-cc78-11e3-81ab-4c9367dc0958";
const PING = JSON.stringify({ zen: "Keep it logically awesome.", hook_id: 1 });
const LIMIT = 25 * 1024 * 1024;

const sign = (body: string | Uint8Array, secret = SECRET) =>
	`sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

/** A home and a secrets directory of the case's own; `secret` null writes no secret file. */
function host(secret: string | null = SECRET) {
	const root = emptyDir("on-event-");
	const secrets = join(root, "secrets");
	mkdirSync(secrets);
	if (secret !== null) writeFileSync(join(secrets, "github_webhook_secret"), secret);
	const deliveries = join(root, "home", "orchestrator", "deliveries");
	return { root, secrets, deliveries, home: join(root, "home") };
}

type Host = ReturnType<typeof host>;

/**
 * Runs the handler with `args` and `body` on stdin, or with stdin left open
 * when `body` is undefined, so a handler that reads it hangs the case. Every
 * run prints exactly one verdict line [12].
 */
async function run(h: Host, args: string[], body?: string | Uint8Array, extra: Record<string, string> = {}) {
	const p = Bun.spawn(["bun", HANDLER, ...args], {
		stdin: body === undefined ? "pipe" : new Blob([body]),
		stdout: "pipe",
		stderr: "pipe",
		env: { PATH: process.env.PATH ?? "", HOME: h.home, PASS_SECRETS: h.secrets, ...extra },
	});
	const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
	const lines = out.split("\n").filter(Boolean);
	expect(lines).toHaveLength(1);
	expect(lines[0]).toMatch(/^event: (handled|ignored|duplicate|refused|failed) — \S/);
	return { line: lines[0], code, all: out + err };
}

const ping = (h: Host, body = PING, delivery = DELIVERY, signature = sign(body)) =>
	run(h, [`ping ${delivery} ${signature}`], body);

/** A pid no process holds: one that has already exited. */
const deadPid = () => Bun.spawnSync(["true"]).pid;

/** A process that claims `delivery` under `dir`, prints whether it won, and holds until its stdin closes. */
function holder(dir: string, delivery = DELIVERY) {
	const script = join(emptyDir("on-event-holder-"), "hold.ts");
	writeFileSync(
		script,
		`import { claim } from ${JSON.stringify(HANDLER)};\n` +
			`console.log(claim(process.argv[2], process.argv[3]) ? "won" : "lost");\n` +
			`await Bun.stdin.text();\n`,
	);
	const p = Bun.spawn(["bun", script, dir, delivery], { stdin: "pipe", stdout: "pipe" });
	const said = (async () => {
		const reader = p.stdout.getReader();
		let text = "";
		while (!text.includes("\n")) {
			const { value, done } = await reader.read();
			if (done) break;
			text += new TextDecoder().decode(value);
		}
		return text.trim();
	})();
	return { p, said, release: () => p.stdin.end() };
}

describe("the argument", () => {
	// spec: orchestrator/a-header-value-of-the-wrong-shape
	test("missing is refused without reading stdin [2]", async () => {
		const r = await run(host(), []);
		expect([r.code, r.line.startsWith("event: refused")]).toEqual([2, true]);
	});

	// spec: orchestrator/a-header-value-of-the-wrong-shape
	test.each([
		["a double space", `ping  ${DELIVERY} ${sign(PING)}`],
		["a tab", `ping\t${DELIVERY} ${sign(PING)}`],
		["a fourth value", `ping ${DELIVERY} ${sign(PING)} extra`],
		["an event with a glob character [11]", `pi* ${DELIVERY} ${sign(PING)}`],
		["an upper-case event", `Ping ${DELIVERY} ${sign(PING)}`],
		["a delivery that is no GUID", `ping 72d3162e-cc78-11e3-81ab ${sign(PING)}`],
		["a signature of 63 hex digits [7]", `ping ${DELIVERY} ${sign(PING).slice(0, -1)}`],
		["a signature of 65 hex digits [7]", `ping ${DELIVERY} ${sign(PING)}0`],
		["an upper-case signature [7]", `ping ${DELIVERY} ${sign(PING).toUpperCase().replace("SHA256", "sha256")}`],
		["a signature without its sha256= prefix", `ping ${DELIVERY} ${sign(PING).slice(7)}`],
	])("with %s is refused without reading stdin [10]", async (_, arg) => {
		const r = await run(host(), [arg]);
		expect([r.code, r.line.startsWith("event: refused")]).toEqual([2, true]);
	});

	// spec: orchestrator/a-header-value-of-the-wrong-shape
	test("split over two arguments is refused [10]", async () => {
		const r = await run(host(), ["ping", `${DELIVERY} ${sign(PING)}`]);
		expect(r.code).toBe(2);
	});
});

describe("the body", () => {
	// spec: orchestrator/a-valid-delivery-of-an-event-no-flow-takes
	test(
		"of exactly 25 MiB is read; one byte more is refused [6]",
		async () => {
			const head = '{"pad":"';
			const fill = (n: number) => `${head}${"x".repeat(n - head.length - 2)}"}`;
			const exact = fill(LIMIT);
			expect(exact.length).toBe(LIMIT);
			const ok = await ping(host(), exact);
			expect([ok.code, ok.line.startsWith("event: ignored")]).toEqual([0, true]);
			const over = `${exact} `;
			const no = await ping(host(), over);
			expect([no.code, no.line.startsWith("event: refused")]).toEqual([2, true]);
		},
		30_000,
	);

	// spec: orchestrator/a-wrong-signature
	test("that is empty under a valid signature verifies, then is refused as no JSON [1]", async () => {
		const r = await ping(host(), "");
		expect([r.code, r.line]).toEqual([2, "event: refused — the body is no JSON"]);
	});
});

describe("the secret", () => {
	// spec: orchestrator/no-secret-on-the-host
	test.each([
		["missing", null],
		["empty", ""],
		["whitespace only", " \n\t\n"],
	])("%s fails naming the file, never its content [9]", async (_, secret) => {
		const h = host(secret);
		const r = await ping(h);
		expect(r.code).toBe(1);
		expect(r.line).toContain(join(h.secrets, "github_webhook_secret"));
		expect(r.line.startsWith("event: failed")).toBe(true);
	});

	// spec: orchestrator/a-valid-delivery-of-an-event-no-flow-takes
	test("with one trailing newline verifies; with two it does not [8]", async () => {
		const one = await ping(host(`${SECRET}\n`));
		expect(one.code).toBe(0);
		const two = await ping(host(`${SECRET}\n\n`));
		expect(two.code).toBe(2);
	});
});

describe("the signature", () => {
	// spec: orchestrator/a-wrong-signature
	test("that does not match is refused, records no delivery, prints neither secret nor expected value [15, 19]", async () => {
		const h = host();
		const r = await ping(h, PING, DELIVERY, sign(PING, "another secret"));
		expect([r.code, r.line]).toEqual([2, "event: refused — the signature does not match the body"]);
		expect(existsSync(h.deliveries) ? readdirSync(h.deliveries) : []).toEqual([]);
		expect(r.all).not.toContain(SECRET);
		expect(r.all).not.toContain(sign(PING).slice(7));
	});

	// spec: orchestrator/a-body-changed-in-transit
	test("of the body without its trailing newline fails [14]", async () => {
		const r = await ping(host(), `${PING}\n`, DELIVERY, sign(PING));
		expect(r.code).toBe(2);
	});
});

describe("a verified delivery", () => {
	// spec: orchestrator/a-valid-delivery-of-an-event-no-flow-takes
	test("of ping is ignored, exit 0 [3]", async () => {
		const r = await ping(host());
		expect([r.code, r.line]).toEqual([0, "event: ignored — no flow takes ping"]);
	});

	// spec: orchestrator/a-valid-delivery-of-an-event-no-flow-takes
	test("of ping is ignored whether or not the App's settings are on the host [63]", async () => {
		const h = host();
		const settings = { HARNESS_GITHUB_APP_ID: "1", HARNESS_GITHUB_APP_KEY: join(h.root, "no-key.pem") };
		const r = await run(h, [`ping ${DELIVERY} ${sign(PING)}`], PING, settings);
		expect([r.code, r.line]).toEqual([0, "event: ignored — no flow takes ping"]);
	});

	// spec: orchestrator/a-valid-delivery-of-an-event-no-flow-takes
	test("of another event no flow takes is ignored", async () => {
		const r = await run(host(), [`workflow_job ${DELIVERY} ${sign(PING)}`], PING);
		expect([r.code, r.line]).toEqual([0, "event: ignored — no flow takes workflow_job"]);
	});

	// spec: orchestrator/a-delivery-that-failed-before-acting
	test("whose handler ended before acting is handled again on redelivery [16]", async () => {
		const h = host();
		expect((await ping(h)).line).toBe("event: ignored — no flow takes ping");
		expect((await ping(h)).line).toBe("event: ignored — no flow takes ping");
	});

	// spec: orchestrator/a-valid-delivery-of-an-event-no-flow-takes
	test("with another delivery id for the same body is handled, not a duplicate [5]", async () => {
		const h = host();
		await ping(h);
		const r = await ping(h, PING, "72d3162e-cc78-11e3-81ab-4c9367dc0959");
		expect(r.line).toBe("event: ignored — no flow takes ping");
	});

	// spec: orchestrator/github-redelivers-a-handled-delivery
	test("whose id a flow acted on is a duplicate, exit 0", async () => {
		const h = host();
		mkdirSync(h.deliveries, { recursive: true });
		writeFileSync(join(h.deliveries, DELIVERY), "acted");
		const r = await ping(h);
		expect([r.code, r.line.startsWith("event: duplicate")]).toEqual([0, true]);
	});

	// spec: orchestrator/a-redelivery-while-the-first-copy-waits
	test("while the first copy still runs is a duplicate [60]", async () => {
		const h = host();
		const first = holder(h.deliveries);
		try {
			expect(await first.said).toBe("won");
			const r = await ping(h);
			expect([r.code, r.line.startsWith("event: duplicate")]).toEqual([0, true]);
		} finally {
			first.release();
			await first.p.exited;
		}
	});

	// spec: orchestrator/a-marker-left-half-written
	test.each([
		["empty", ""],
		["cut off mid-write", "acte"],
		["holding pid 0", "0"],
	])("whose marker is %s is handled [62]", async (_, content) => {
		const h = host();
		mkdirSync(h.deliveries, { recursive: true });
		writeFileSync(join(h.deliveries, DELIVERY), content);
		expect((await ping(h)).line).toBe("event: ignored — no flow takes ping");
	});
});

describe("a claim", () => {
	// spec: orchestrator/github-redelivers-a-handled-delivery
	test("of an id this process holds loses, and leaves no temporary file", () => {
		const dir = join(emptyDir("on-event-"), "deliveries");
		expect([claim(dir, DELIVERY), claim(dir, DELIVERY)]).toEqual([true, false]);
		expect(readdirSync(dir)).toEqual([DELIVERY]);
	});

	// spec: orchestrator/a-delivery-that-failed-before-acting
	test("over a dead pid's marker wins and leaves no tombstone [16]", () => {
		const dir = join(emptyDir("on-event-"), "deliveries");
		mkdirSync(dir);
		writeFileSync(join(dir, DELIVERY), String(deadPid()));
		expect(claim(dir, DELIVERY)).toBe(true);
		expect(readdirSync(dir)).toEqual([DELIVERY]);
	});

	// spec: orchestrator/a-handler-killed-before-acting
	test("after the holder was killed with SIGKILL wins [59]", async () => {
		const dir = join(emptyDir("on-event-"), "deliveries");
		const first = holder(dir);
		expect(await first.said).toBe("won");
		first.p.kill("SIGKILL");
		await first.p.exited;
		expect(claim(dir, DELIVERY)).toBe(true);
	});

	// spec: orchestrator/two-copies-at-once
	test(
		"by six processes at once is won by exactly one [4]",
		async () => {
			const dir = join(emptyDir("on-event-"), "deliveries");
			const all = Array.from({ length: 6 }, () => holder(dir));
			try {
				const said = await Promise.all(all.map((h) => h.said));
				expect(said.filter((s) => s === "won")).toHaveLength(1);
				expect(said.filter((s) => s === "lost")).toHaveLength(5);
			} finally {
				for (const h of all) h.release();
				await Promise.all(all.map((h) => h.p.exited));
			}
		},
		30_000,
	);

	// spec: orchestrator/two-handlers-recover-one-dead-marker
	test(
		"of one dead marker by six processes at once is won by exactly one [68]",
		async () => {
			const dir = join(emptyDir("on-event-"), "deliveries");
			mkdirSync(dir);
			writeFileSync(join(dir, DELIVERY), String(deadPid()));
			const all = Array.from({ length: 6 }, () => holder(dir));
			try {
				const said = await Promise.all(all.map((h) => h.said));
				expect(said.filter((s) => s === "won")).toHaveLength(1);
				expect(readdirSync(dir)).toEqual([DELIVERY]);
			} finally {
				for (const h of all) h.release();
				await Promise.all(all.map((h) => h.p.exited));
			}
		},
		30_000,
	);
});
