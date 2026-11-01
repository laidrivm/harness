/**
 * The event handler run as the engine runs it, for `on-event.test.ts`: a
 * signed delivery, a host of the case's own, and a process that holds a
 * delivery's claim. `afterAll` is not registered here: the test file
 * registers `diff-budget.fixture.ts`'s `cleanup` itself.
 */
import { expect } from "bun:test";
import { createHmac } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { emptyDir } from "./diff-budget.fixture.ts";

const HANDLER = join(import.meta.dir, "on-event.ts");
export const SECRET = "s3cret-of-the-webhook";
export const DELIVERY = "72d3162e-cc78-11e3-81ab-4c9367dc0958";
export const PING = JSON.stringify({ zen: "Keep it logically awesome.", hook_id: 1 });
export const LIMIT = 25 * 1024 * 1024;

export const sign = (body: string | Uint8Array, secret = SECRET) =>
	`sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

/** A home and a secrets directory of the case's own; `secret` null writes no secret file. */
export function host(secret: string | null = SECRET) {
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
export async function run(h: Host, args: string[], body?: string | Uint8Array, extra: Record<string, string> = {}) {
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

export const ping = (h: Host, body = PING, delivery = DELIVERY, signature = sign(body)) =>
	run(h, [`ping ${delivery} ${signature}`], body);

/** A pid no process holds: one that has already exited. */
export const deadPid = () => Bun.spawnSync(["true"]).pid;

/** A process that claims `delivery` under `dir`, prints whether it won, and holds until its stdin closes. */
export function holder(dir: string, delivery = DELIVERY) {
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
