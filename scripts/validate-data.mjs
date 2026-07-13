import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const COUNTRIES_DIR = path.join(ROOT, "data", "countries");

const schema = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "schema.json"), "utf8"));
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validate = ajv.compile(schema);

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "manifest.json"), "utf8"));
const files = fs
  .readdirSync(COUNTRIES_DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.replace(/\.json$/, ""))
  .sort();

let errors = 0;

const manifestSet = new Set(manifest.countries);
const fileSet = new Set(files);
for (const iso3 of files) {
  if (!manifestSet.has(iso3)) {
    console.error(`manifest.json is missing "${iso3}" (run: npm run build:manifest)`);
    errors++;
  }
}
for (const iso3 of manifest.countries) {
  if (!fileSet.has(iso3)) {
    console.error(`manifest.json references "${iso3}" but data/countries/${iso3}.json does not exist`);
    errors++;
  }
}

for (const iso3 of files) {
  const filePath = path.join(COUNTRIES_DIR, `${iso3}.json`);
  const record = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (!validate(record)) {
    console.error(`data/countries/${iso3}.json failed schema validation:`);
    for (const err of validate.errors) {
      console.error(`  ${err.instancePath || "/"} ${err.message}`);
    }
    errors++;
  }
  if (record.iso3 !== iso3) {
    console.error(`data/countries/${iso3}.json: "iso3" field ("${record.iso3}") does not match filename`);
    errors++;
  }
}

if (errors > 0) {
  console.error(`\n${errors} problem(s) found across ${files.length} country files.`);
  process.exit(1);
}

console.log(`OK: ${files.length} country files validate against data/schema.json and match manifest.json.`);
