import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const COUNTRIES_DIR = path.join(ROOT, "data", "countries");
const MANIFEST_PATH = path.join(ROOT, "data", "manifest.json");

const countries = fs
  .readdirSync(COUNTRIES_DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.replace(/\.json$/, ""))
  .sort();

// No generatedAt/timestamp field here on purpose: this file's only job is to
// list which country files exist, and CI diffs it byte-for-byte to catch a
// stale manifest. A timestamp would make that diff fail every day regardless
// of whether the country list actually changed.
const manifest = { countries };

fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
console.log(`data/manifest.json: ${countries.length} countries`);
