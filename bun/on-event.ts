/**
 * The event handler every webhook flow enters through. The engine answers
 * GitHub itself, then runs, as the runner's user,
 *
 *   bun /opt/orchestrator/bun/on-event.ts '<event> <delivery> <signature>'
 *
 * with the body's bytes on stdin. The three header values come from the
 * internet unverified, so they arrive as one argument no shell splits, and each
 * is checked against an anchored pattern before the body is read. Then the
 * body's HMAC under the webhook secret, then the delivery id, then the route.
 * Prints one line, `event: <verdict> — <reason>`, and exits 0 for an event it
 * handled, ignored or found a duplicate, 2 for one it refused, 1 for a failure.
 * `ci-run-agent`'s design fixes the order and the contract.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { linkSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

type Verdict = "handled" | "ignored" | "duplicate" | "refused" | "failed";

const EXIT: Record<Verdict, number> = { handled: 0, ignored: 0, duplicate: 0, refused: 2, failed: 1 };

/** GitHub's payload cap. */
const LIMIT = 25 * 1024 * 1024;

/** `X-GitHub-Event`, `X-GitHub-Delivery` and `X-Hub-Signature-256`, each whole. */
const SHAPES = [/^[a-z_]+$/, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, /^sha256=[0-9a-f]{64}$/];

const code = (e: unknown) => (e as NodeJS.ErrnoException)?.code;

/** The body, or undefined once it passes the cap. */
async function body(stream: ReadableStream<Uint8Array>) {
	const chunks: Uint8Array[] = [];
	let size = 0;
	for await (const chunk of stream) {
		size += chunk.length;
		if (size > LIMIT) return undefined;
		chunks.push(chunk);
	}
	return Buffer.concat(chunks);
}

/** Links `from` to `to`, or answers false when `to` exists. */
function link(from: string, to: string) {
	try {
		linkSync(from, to);
		return true;
	} catch (e) {
		if (code(e) === "EEXIST") return false;
		throw e;
	}
}

/** What a marker holds, or undefined once it is gone: another handler took it. */
function read(path: string) {
	try {
		return readFileSync(path, "utf8");
	} catch (e) {
		if (code(e) === "ENOENT") return undefined;
		throw e;
	}
}

/** Whether a marker's content is a handler that ended before acting. */
function dead(content: string) {
	if (content === "acted") return false;
	if (!/^[1-9]\d*$/.test(content)) return true;
	try {
		process.kill(Number(content), 0);
		return false;
	} catch (e) {
		// EPERM is a process that runs as another user: still running.
		return code(e) === "ESRCH";
	}
}

/**
 * Records `delivery` under `dir` with this process's pid, or answers false
 * when another handler holds it: one that acted, or one still running. A
 * marker holding a dead pid, or neither a pid nor `acted`, is a handler that
 * ended before acting, so it is replaced and the delivery handled. The marker
 * appears through `link()` and is taken over through `rename()`, so of two
 * handlers racing for one id exactly one wins.
 */
export function claim(dir: string, delivery: string) {
	mkdirSync(dir, { recursive: true, mode: 0o700 });
	const marker = join(dir, delivery);
	const own = `${marker}.${process.pid}`;
	writeFileSync(`${own}.tmp`, String(process.pid));
	try {
		if (link(`${own}.tmp`, marker)) return true;
		const seen = read(marker);
		if (seen === undefined || !dead(seen)) return false;
		try {
			renameSync(marker, `${own}.dead`);
		} catch (e) {
			// Another handler renamed the dead marker first: the delivery is its.
			if (code(e) === "ENOENT") return false;
			throw e;
		}
		// A rename after another handler's recovery took its live marker: hand it back.
		// shortcut: a third copy linking in that gap also wins; record it if a delivery is ever handled twice.
		const won = read(`${own}.dead`) === seen && link(`${own}.tmp`, marker);
		if (!won) link(`${own}.dead`, marker);
		unlinkSync(`${own}.dead`);
		return won;
	} finally {
		unlinkSync(`${own}.tmp`);
	}
}

async function handle(args: string[]): Promise<[Verdict, string]> {
	const values = args.length === 1 ? args[0].split(" ") : [];
	if (values.length !== 3 || !values.every((value, i) => SHAPES[i].test(value)))
		return ["refused", "the argument is not '<event> <delivery> <signature>' in their shapes"];
	const [event, delivery, signature] = values;
	const bytes = await body(Bun.stdin.stream());
	if (bytes === undefined) return ["refused", `the body passes GitHub's cap of ${LIMIT} bytes`];
	const path = join(process.env.PASS_SECRETS || "/run/secrets", "github_webhook_secret");
	let secret = "";
	try {
		secret = readFileSync(path, "utf8").replace(/\n$/, "");
	} catch {}
	if (!secret.trim()) return ["failed", `${path} holds no webhook secret`];
	const expected = Buffer.from(`sha256=${createHmac("sha256", secret).update(bytes).digest("hex")}`);
	const given = Buffer.from(signature);
	// timingSafeEqual throws on unequal lengths.
	if (given.length !== expected.length || !timingSafeEqual(given, expected))
		return ["refused", "the signature does not match the body"];
	try {
		JSON.parse(bytes.toString("utf8"));
	} catch {
		return ["refused", "the body is no JSON"];
	}
	if (!claim(join(homedir(), "orchestrator", "deliveries"), delivery))
		return ["duplicate", `delivery ${delivery} is another handler's`];
	// No flow takes an event yet: the CI flow adds `workflow_run`.
	return ["ignored", `no flow takes ${event}`];
}

if (import.meta.main) {
	let verdict: Verdict;
	let reason: string;
	try {
		[verdict, reason] = await handle(process.argv.slice(2));
	} catch (e) {
		[verdict, reason] = ["failed", e instanceof Error ? e.message : String(e)];
	}
	console.log(`event: ${verdict} — ${reason}`);
	process.exit(EXIT[verdict]);
}
