// TODO(biome-yaml): Biome's YAML support is on their 2026 roadmap; once it
// ships, delete this script and fold YAML into the biome job in lint.yml.
import { Glob } from "bun";

let failed = false;
for await (const path of new Glob("**/*.{yml,yaml}").scan({ dot: true })) {
	if (path.includes("node_modules/") || path.startsWith(".git/")) continue;
	try {
		Bun.YAML.parse(await Bun.file(path).text());
	} catch (e) {
		failed = true;
		console.error(`${path}: ${e instanceof Error ? e.message : String(e)}`);
	}
}
if (failed) process.exit(1);
