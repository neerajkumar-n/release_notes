import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { summarizeWithAI } from "./lib/aiClient.js";
import type { ExtractionResult } from "./lib/types.js";

const ARTIFACTS_DIR = "artifacts";
const PROMPT_TEMPLATE_PATH = "templates/weekly_summary_prompt.md";

async function main() {
  const baseUrl = process.env.AI_API_BASE_URL;
  const apiKey = process.env.AI_API_KEY;
  const model = process.env.AI_MODEL_NAME;

  if (!baseUrl || !apiKey || !model) {
    throw new Error(
      "AI_API_BASE_URL, AI_API_KEY, and AI_MODEL_NAME must all be set (via GitHub Secrets/variables)."
    );
  }

  const systemPrompt = await readFile(PROMPT_TEMPLATE_PATH, "utf8");
  const rawPath = path.join(ARTIFACTS_DIR, "raw-changelog.json");
  const extraction: ExtractionResult = JSON.parse(await readFile(rawPath, "utf8"));

  if (extraction.entries.length === 0) {
    console.log("No entries to summarize; skipping AI call.");
    await mkdir(ARTIFACTS_DIR, { recursive: true });
    await writeFile(path.join(ARTIFACTS_DIR, "summary.md"), "");
    return;
  }

  const userContent = JSON.stringify(
    {
      window: { start_time: extraction.start_time, end_time: extraction.end_time },
      entries: extraction.entries,
    },
    null,
    2
  );

  const { request, summary } = await summarizeWithAI(systemPrompt, userContent, {
    baseUrl,
    apiKey,
    model,
  });

  await mkdir(ARTIFACTS_DIR, { recursive: true });
  await writeFile(path.join(ARTIFACTS_DIR, "ai-request.json"), JSON.stringify(request, null, 2));
  await writeFile(path.join(ARTIFACTS_DIR, "summary.md"), summary);

  console.log(`Summary generated (${summary.split(/\s+/).filter(Boolean).length} words).`);
}

main().catch((err) => {
  console.error("AI summarization failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
