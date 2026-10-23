/**
 * GitHub's webhook, from the async route `github`: Windmill answers GitHub at
 * once, then runs this. The preprocessor takes the three headers and the raw
 * body the signature covers; main hands them to the runner over the event key,
 * whose forced command runs the handler with the headers as its one argument
 * and the body on stdin (ci-run-agent design, *The engine's contract*). The
 * handler checks the signature, so a wrong one reads as delivered on GitHub
 * and as a failed job in Runs; the job's status is the handler's.
 *
 * The key is the secret variable f/orchestrator/runner_event_key, the private
 * key base64-encoded on one line, read by its path alone.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

type Event = { raw_string?: string; headers: Record<string, unknown> };

export async function preprocessor(event: Event) {
	const header = (name: string) => String(event.headers[name] ?? "");
	return { line: ["x-github-event", "x-github-delivery", "x-hub-signature-256"].map(header).join(" "), body: event.raw_string ?? "" };
}

export async function main(line: string, body: string) {
	const { BASE_INTERNAL_URL, WM_WORKSPACE, WM_TOKEN } = process.env;
	const res = await fetch(`${BASE_INTERNAL_URL}/api/w/${WM_WORKSPACE}/variables/get_value/f/orchestrator/runner_event_key`, {
		headers: { Authorization: `Bearer ${WM_TOKEN}` },
	});
	if (!res.ok) throw new Error(`the event key: HTTP ${res.status}`);
	const dir = mkdtempSync(join(tmpdir(), "event-"));
	const key = join(dir, "key");
	try {
		writeFileSync(key, Buffer.from(String(await res.json()), "base64"), { mode: 0o600 });
		// The runner's host key is pinned, so another container answering as runner fails the job.
		const ssh = Bun.spawn(
			["ssh", "-i", key, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "-o", "UserKnownHostsFile=/run/secrets/runner_known_hosts", "-o", "LogLevel=ERROR", "runner@runner", line],
			{ stdin: new TextEncoder().encode(body), stdout: "inherit", stderr: "inherit" },
		);
		const code = await ssh.exited;
		if (code !== 0) throw new Error(`the handler exited ${code}`);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}
