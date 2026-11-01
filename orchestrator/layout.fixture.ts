/**
 * The tree's `orchestrator/` files and readers over them, for the layout
 * test files.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { tracked } from "../bun/tracked.ts";

export const { root, files } = tracked(import.meta.dir);
export const mine = files.filter((p) => p.startsWith("orchestrator/"));
export const read = (p: string) => readFileSync(join(root, p), "utf8");
export const yaml = (p: string) => Bun.YAML.parse(read(p)) as Record<string, unknown>;
export const wm = "orchestrator/windmill/";
export const scripts = mine.filter((p) => p.startsWith(wm) && p.endsWith(".script.yaml"));
export const schedules = () => mine.filter((p) => p.startsWith(wm) && p.endsWith(".schedule.yaml")).map((p) => ({ path: p, doc: yaml(p) }));
export const composed = () => yaml("orchestrator/compose.yaml");
export const image = (v: string) => `ghcr.io/windmill-labs/windmill:${v}@sha256:${"0".repeat(64)}`;
