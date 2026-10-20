import { afterAll, describe, expect, test } from "bun:test";
import { cleanup, event, fabricate, run } from "./command-guard.fixture.ts";

/**
 * The one `gh api` write the guard lets through: opening a pull request at
 * exactly `repos/<owner>/<repo>/pulls`, the act `gh pr create` already
 * performs, which a cloud session cannot run since that command reads
 * GraphQL (cloud-sessions, user 2026-10-20).
 */

afterAll(cleanup);

const anywhere = () => fabricate("feat/x");
const FIELDS = "-f title=t -f head=feat/x -f base=main -f body=b";

describe("gh api opening a pull request", () => {
	// spec: agent-permissions/a-pull-request-opened-through-the-endpoint
	test.each([
		`-X POST repos/o/r/pulls ${FIELDS}`,
		`--method POST /repos/o/r/pulls ${FIELDS}`,
		`--method=post repos/o.x/r-y_z/pulls ${FIELDS}`,
		`repos/o/r/pulls ${FIELDS}`,
		"repos/o/r/pulls --input pr.json",
		`-X POST repos/o/.github/pulls ${FIELDS}`,
		`-X POST repos/o/r/pulls ${FIELDS} -F draft=true --jq .number`,
	])("gh api %s is allowed", (rest) => {
		expect(run(event(`gh api ${rest}`), anywhere()).code).toBe(0);
	});

	// spec: agent-permissions/a-write-to-another-endpoint-is-still-refused
	test.each([
		"repos/o/r/pulls/1",
		"repos/o/r/pulls/1/comments",
		"repos/o/r/pulls/",
		"repos/o/r/pulls?per_page=1",
		"repos/o/r/issues",
		"xrepos/o/r/pulls",
		"repos/o/r/x/pulls",
		"repos/o/pulls",
		"repos/../r/pulls",
		"repos/o/../pulls",
		"repos/{owner}/{repo}/pulls",
		"graphql",
	])("POST to %s still blocks", (path) => {
		expect(run(event(`gh api -X POST ${path} ${FIELDS}`), anywhere()).code).toBe(2);
	});

	// spec: agent-permissions/a-write-to-another-endpoint-is-still-refused
	test.each(["-X PATCH", "-X PUT", "-X DELETE", "-X POST -X PATCH", "--method PATCH --method POST"])(
		"%s on the endpoint blocks",
		(method) => {
			expect(run(event(`gh api ${method} repos/o/r/pulls ${FIELDS}`), anywhere()).code).toBe(2);
		},
	);

	// spec: agent-permissions/a-write-to-another-endpoint-is-still-refused
	test.each([
		`-X POST repos/o/r/pulls ${FIELDS} --some-future-flag`,
		`-X POST repos/o/r/pulls repos/o/r/issues ${FIELDS}`,
	])("gh api %s blocks", (rest) => {
		expect(run(event(`gh api ${rest}`), anywhere()).code).toBe(2);
	});
});
