// The Executa ships on its own, so it carries copies of the shared note logic (ADR-0002).
// `npm run sync` refreshes them from src/lib; test/executa.test.js fails if they drift.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const SHARED = ["chattools.js", "store.js", "parse.js", "vault.js"];
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  mkdirSync(join(root, "executas/abyss-tools/lib"), { recursive: true });
  for (const f of SHARED) copyFileSync(join(root, "src/lib", f), join(root, "executas/abyss-tools/lib", f));
  console.log(`synced ${SHARED.join(", ")} -> executas/abyss-tools/lib`);
}
