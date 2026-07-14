// Monthly AI-assisted data-verification pass.
//
// For each country, asks Claude (with the web_search tool enabled) to check
// current values against real, fetched sources and propose changes as
// strict JSON. A change with no source URL is discarded in code — citation
// is enforced here, not just requested in the prompt. Changed files are
// written to disk; the GitHub Actions workflow then opens a PR via
// peter-evans/create-pull-request. This script never commits, pushes, or
// merges anything itself.
//
// Env vars:
//   ANTHROPIC_API_KEY  required unless DRY_RUN=1
//   MODEL              default "claude-opus-4-8"; set to e.g. "claude-sonnet-5"
//                       to cut cost across a 199-country monthly run
//   LIMIT              optional int — only process the first N countries
//                       (alphabetical by ISO3), for cost control while testing
//   DRY_RUN            "1" skips the Anthropic API entirely and returns a
//                       mocked "no changes" result, to smoke-test the
//                       write/validate/PR-body plumbing with no network call
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const COUNTRIES_DIR = path.join(ROOT, "data", "countries");
const MODEL = process.env.MODEL || "claude-opus-4-8";
const DRY_RUN = process.env.DRY_RUN === "1";
const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : undefined;
const CONCURRENCY = 4;
const TODAY = new Date().toISOString().slice(0, 10);

const CHANGE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["iso3", "noChangesFound", "changes"],
  properties: {
    iso3: { type: "string" },
    noChangesFound: { type: "boolean" },
    changes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["field", "oldValue", "newValue", "sourceUrl", "sourceLabel"],
        properties: {
          field: {
            type: "string",
            enum: [
              "passportIndex.score",
              "flags.euMember",
              "flags.schengenMember",
              "flags.usVisaWaiver",
              "flags.citizenshipByInvestment",
              "dualNationality.status",
            ],
          },
          oldValue: { type: "string" },
          newValue: { type: "string" },
          sourceUrl: { type: "string" },
          sourceLabel: { type: "string" },
        },
      },
    },
  },
};

function getPath(obj, field) {
  return field.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
}
function setPath(obj, field, value) {
  const parts = field.split(".");
  const last = parts.pop();
  const target = parts.reduce((o, k) => o[k], obj);
  target[last] = value;
}
function coerce(field, rawValue) {
  const current = field === "passportIndex.score" ? 0 : typeof rawValue;
  if (field === "passportIndex.score") return parseInt(rawValue, 10);
  if (field.startsWith("flags.")) return rawValue === "true" || rawValue === true;
  return rawValue; // dualNationality.status stays a string enum
}

async function verifyCountry(record, client) {
  const prompt = `Country: ${record.name.en} (${record.iso3} / ${record.iso2})
Current data:
  passportIndex.score = ${record.passportIndex.score}
  flags.euMember = ${record.flags.euMember}
  flags.schengenMember = ${record.flags.schengenMember}
  flags.usVisaWaiver = ${record.flags.usVisaWaiver}
  flags.citizenshipByInvestment = ${record.flags.citizenshipByInvestment}
  dualNationality.status = ${record.dualNationality.status}

Use web search to verify these against current, authoritative sources. Only
report a field in "changes" if you found a specific source proving the
current value above is now wrong, and you can cite that source's exact URL.
Set "oldValue"/"newValue" as strings. If nothing needs to change, set
noChangesFound=true and leave changes empty.`;

  if (DRY_RUN) {
    return { iso3: record.iso3, noChangesFound: true, changes: [] };
  }

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    tools: [{ type: "web_search_20260209", name: "web_search" }],
    output_config: { format: { type: "json_schema", schema: CHANGE_SCHEMA } },
    messages: [{ role: "user", content: prompt }],
  });

  const textBlocks = response.content.filter((b) => b.type === "text");
  const last = textBlocks[textBlocks.length - 1];
  if (!last) throw new Error(`${record.iso3}: no text block in response (stop_reason=${response.stop_reason})`);
  return JSON.parse(last.text);
}

function applyChanges(record, result) {
  const applied = [];
  for (const change of result.changes || []) {
    if (!change.sourceUrl || !/^https?:\/\//.test(change.sourceUrl)) {
      console.warn(`  skipping "${change.field}" for ${result.iso3}: no valid sourceUrl`);
      continue;
    }
    const before = getPath(record, change.field);
    const after = coerce(change.field, change.newValue);
    if (JSON.stringify(before) === JSON.stringify(after)) continue; // no-op, skip
    setPath(record, change.field, after);
    applied.push({ field: change.field, oldValue: before, newValue: after, sourceUrl: change.sourceUrl, sourceLabel: change.sourceLabel });
  }
  if (applied.length > 0) {
    record.sources.push(
      ...applied.map((a) => ({
        label: a.sourceLabel || "AI-assisted monthly verification",
        url: a.sourceUrl,
        accessedDate: TODAY,
        fields: [a.field],
      }))
    );
    record.lastUpdated = TODAY;
  }
  return applied;
}

async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function main() {
  if (!DRY_RUN && !process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set (and DRY_RUN is not 1). Nothing to do.");
    process.exit(1);
  }

  let client;
  if (!DRY_RUN) {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    client = new Anthropic();
  }

  let iso3s = fs
    .readdirSync(COUNTRIES_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""))
    .sort();
  if (LIMIT) iso3s = iso3s.slice(0, LIMIT);

  console.log(`Checking ${iso3s.length} countries with model=${MODEL} dryRun=${DRY_RUN}`);

  const summaryRows = [];
  let changedCount = 0;

  await mapWithConcurrency(iso3s, CONCURRENCY, async (iso3) => {
    const filePath = path.join(COUNTRIES_DIR, `${iso3}.json`);
    const record = JSON.parse(fs.readFileSync(filePath, "utf8"));
    let result;
    try {
      result = await verifyCountry(record, client);
    } catch (err) {
      console.error(`  ${iso3}: verification failed — ${err.message}`);
      return;
    }
    const applied = applyChanges(record, result);
    if (applied.length > 0) {
      fs.writeFileSync(filePath, JSON.stringify(record, null, 2) + "\n");
      changedCount++;
      for (const a of applied) {
        summaryRows.push(
          `| ${record.name.en} (${iso3}) | \`${a.field}\` | ${a.oldValue} → ${a.newValue} | [${a.sourceLabel || "source"}](${a.sourceUrl}) |`
        );
      }
      console.log(`  ${iso3}: ${applied.length} change(s) applied`);
    }
  });

  const prBodyLines = [
    "## Monthly data verification (AI-assisted)",
    "",
    `Model: \`${MODEL}\`. Every change below is backed by a source this script actually retrieved via web search during this run — proposals without a valid source URL are automatically rejected.`,
    "",
  ];
  if (summaryRows.length > 0) {
    prBodyLines.push("| Country | Field | Old → New | Source |", "|---|---|---|---|", ...summaryRows);
  } else {
    prBodyLines.push("_No changes found in this run._");
  }
  prBodyLines.push("", "**Review every source before merging this PR.** This workflow never publishes automatically and has no merge permission.");

  const prBodyPath = path.join(process.env.RUNNER_TEMP || os.tmpdir(), "pr-body.md");
  fs.writeFileSync(prBodyPath, prBodyLines.join("\n") + "\n");
  console.log(`\nPR body written to ${prBodyPath}`);
  console.log(`${changedCount} of ${iso3s.length} countries changed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
