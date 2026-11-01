/**
 * What the floors' cases expect of an unreadable field: one problem naming
 * `harness.<key>.<field>`. Its own module because three test files assert it —
 * `floor.test.ts` and each caller's — and a copy per file would drift in what
 * it matches.
 */
import { expect } from "bun:test";

/** What `gauge` returns for a floor under `key` whose one fault is `field`. */
export const naming = (key: string, field: string) => [
	expect.stringContaining(`harness.${key}.${field}`),
];
