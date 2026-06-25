import { readFile } from "node:fs/promises";
import path from "node:path";
import { publishWeeklySummary } from "./lib/sanityClient.js";
import type { ExtractionResult, SummaryPayload } from "./lib/types.js";

const ARTIFACTS_DIR = "artifacts";

async function main() {
  const projectId = process.env.SANITY_PROJECT_ID;
  const dataset = process.env.SANITY_DATASET;
  const apiToken = process.env.SANITY_API_TOKEN;
  const documentType = process.env.SANITY_DOCUMENT_TYPE;

  if (!projectId || !dataset || !apiToken || !documentType) {
    throw new Error(
      "SANITY_PROJECT_ID, SANITY_DATASET, SANITY_API_TOKEN, and SANITY_DOCUMENT_TYPE must all be set."
    );
  }

  const summaryMarkdown = await readFile(path.join(ARTIFACTS_DIR, "summary.md"), "utf8");
  if (!summaryMarkdown.trim()) {
    console.log("Summary is empty; nothing to publish.");
    return;
  }

  const extraction: ExtractionResult = JSON.parse(
    await readFile(path.join(ARTIFACTS_DIR, "raw-changelog.json"), "utf8")
  );

  const payload: SummaryPayload = {
    weekStart: extraction.start_time.slice(0, 10),
    weekEnd: extraction.end_time.slice(0, 10),
    entryCount: extraction.entries.length,
    generatedAt: new Date().toISOString(),
    markdown: summaryMarkdown,
  };

  const result = await publishWeeklySummary(payload, { projectId, dataset, apiToken, documentType });
  console.log(`Published to Sanity: ${result._id}`);
}

main().catch((err) => {
  console.error("Sanity publishing failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
