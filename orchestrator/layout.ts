/**
 * What the tracked `orchestrator/` directory may hold, as checks over text and
 * parsed YAML. Each returns the failures it found, naming the file, line or
 * service; `layout.test.ts` runs them over fabricated input and the tree.
 */

/** The comment every pin carries, on its line or the line above (`design.md` *Pins and their notes*). */
export const NOTE = "moved by hand — nothing updates this pin";

/** The oldest Windmill release whose HTTP routes answer in CE. */
export const FLOOR = "1.846.1";

const parts = (v: string) => v.split(".").map(Number);

/** Whether `v` is `floor` or later, field by field as numbers: 1.1000.0 is past 1.846.1. */
export function atLeast(v: string, floor: string): boolean {
	const [a, b] = [parts(v), parts(floor)];
	for (let i = 0; i < Math.max(a.length, b.length); i++) {
		const d = (a[i] ?? 0) - (b[i] ?? 0);
		if (d !== 0) return d > 0;
	}
	return true;
}

/** The Windmill images: each at the floor or later, and all on one version. */
export function windmillImages(images: string[]): string[] {
	const wrong: string[] = [];
	const versions = new Set<string>();
	for (const image of images) {
		const v = /windmill-labs\/windmill(?:-ee)?:(\d+\.\d+\.\d+)(?:@|$)/.exec(image)?.[1];
		if (!v) {
			wrong.push(`${image}: no x.y.z tag to compare with the floor ${FLOOR}`);
			continue;
		}
		versions.add(v);
		if (!atLeast(v, FLOOR)) wrong.push(`${image}: below the floor ${FLOOR}`);
	}
	if (versions.size > 1) wrong.push(`the server and the workers carry different versions: ${[...versions].join(", ")}`);
	return wrong;
}

type Doc = Record<string, unknown>;
export type Parsed = { path: string; doc: Doc };

/** Croner's hourly forms, with and without its leading seconds field. */
const HOURLY = /^(?:0 )?0 \* \* \* \*$/;

/** The pass script: tag `pass`, a timeout of at least 5400 s, no concurrency limit, and an hourly schedule on the script itself. */
export function passScript(path: string, meta: Doc, schedules: Parsed[]): string[] {
	const wrong: string[] = [];
	if (meta.tag !== "pass") wrong.push(`${path}: tag is ${String(meta.tag)}, not pass`);
	if (typeof meta.timeout !== "number" || meta.timeout < 5400) wrong.push(`${path}: timeout ${String(meta.timeout)} is under 5400`);
	// CE stores the limit and ignores it (windmill#10840), so a set one only reads as a guard.
	if ("concurrent_limit" in meta) wrong.push(`${path}: sets concurrent_limit, which Windmill CE ignores`);
	const own = schedules.filter((s) => s.doc.script_path === path);
	if (!own.length) wrong.push(`${path}: no schedule names it`);
	for (const s of own) {
		if (s.doc.is_flow !== false) wrong.push(`${s.path}: is_flow is not false`);
		if (!HOURLY.test(String(s.doc.schedule).trim())) wrong.push(`${s.path}: ${String(s.doc.schedule)} is not hourly`);
		// A pass before runner-isolation's launcher only pauses the clone, so the user enables it by hand.
		if (s.doc.enabled !== false) wrong.push(`${s.path}: is pushed enabled`);
	}
	return wrong;
}

/** The script's last command is the `ssh` call, so its status is the job's. */
export function endsOnSsh(path: string, text: string): string[] {
	const last = text.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#")).at(-1) ?? "";
	return /^ssh\s/.test(last) ? [] : [`${path}: ends on \`${last}\`, not the ssh call`];
}

/** A variable file carrying a value: `--skip-secrets` writes none. */
export const variableValues = (files: Parsed[]) =>
	files.filter((f) => f.doc.value !== undefined && f.doc.value !== null && f.doc.value !== "").map((f) => `${f.path}: carries a value`);

type Service = { image?: string; environment?: Record<string, unknown> | string[]; deploy?: { replicas?: number } };

/** A service's environment as name → value, from either compose form. */
function env(s: Service): Record<string, string> {
	const e = s.environment ?? {};
	if (!Array.isArray(e)) return Object.fromEntries(Object.entries(e).map(([k, v]) => [k, String(v ?? "")]));
	return Object.fromEntries(e.map((line) => [line.split("=")[0], line.slice(line.indexOf("=") + 1)]));
}

const SECRETISH = /token|key|secret|password/i;

/** Compose: one single-replica worker takes the tag `pass` and no other, and no secret is a literal. */
export function compose(doc: Doc): string[] {
	const wrong: string[] = [];
	const services = (doc.services ?? {}) as Record<string, Service>;
	const takers = Object.entries(services).filter(([, s]) => (env(s).WORKER_TAGS ?? "").split(",").map((t) => t.trim()).includes("pass"));
	const pass = services.windmill_worker_pass;
	if (!pass) wrong.push("no windmill_worker_pass service");
	else {
		if (pass.deploy?.replicas !== 1) wrong.push("windmill_worker_pass: replicas is not 1");
		if (env(pass).WORKER_TAGS !== "pass") wrong.push("windmill_worker_pass: WORKER_TAGS is not pass");
	}
	for (const [name] of takers) if (name !== "windmill_worker_pass") wrong.push(`${name}: takes the tag pass`);
	for (const [name, s] of Object.entries(services))
		for (const [k, v] of Object.entries(env(s)))
			if (SECRETISH.test(k) && !v.startsWith("/run/secrets/")) wrong.push(`${name}: ${k} is a literal, not a secret file`);
	return wrong;
}

/** A tracked file other than the README that starts Remote Control. `-{2}` keeps this file's own source from matching. */
export const remoteControl = (path: string, text: string) =>
	path !== "orchestrator/README.md" && /claude\s+remote-control|-{2}remote-control\b/.test(text) ? [`${path}: starts Remote Control`] : [];

const PINNED = /^\s*(?:FROM\s|image:|ARG\s+\w+_(?:VERSION|SHA256)=)/;

/** Every pin by digest or full version, each with its note. */
export function pins(path: string, text: string): string[] {
	const wrong: string[] = [];
	const lines = text.split("\n");
	lines.forEach((line, i) => {
		if (!PINNED.test(line)) return;
		const at = `${path}:${i + 1}`;
		if (/^\s*(?:FROM\s|image:)/.test(line) && !line.includes("@sha256:")) wrong.push(`${at}: no @sha256: digest`);
		if (!line.includes(NOTE) && !(lines[i - 1] ?? "").includes(NOTE)) wrong.push(`${at}: no note naming what moves the pin`);
		const version = /^\s*ARG\s+\w+_VERSION=(\S*)/.exec(line)?.[1];
		if (version !== undefined && !/^\d+\.\d+\.\d+$/.test(version)) wrong.push(`${at}: ${version} is not a full x.y.z`);
	});
	return wrong;
}

const IPV4 = /\b(\d{1,3}(?:\.\d{1,3}){3})\b/g;
const TOKEN = /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-ant-[A-Za-z0-9_-]{20,})/;

/** A host address or a GitHub or Anthropic token in a tracked file. */
export function leaks(path: string, text: string): string[] {
	const wrong: string[] = [];
	for (const [, ip] of text.matchAll(IPV4)) if (ip !== "127.0.0.1" && ip !== "0.0.0.0") wrong.push(`${path}: holds the address ${ip}`);
	if (TOKEN.test(text)) wrong.push(`${path}: holds a token`);
	return wrong;
}
