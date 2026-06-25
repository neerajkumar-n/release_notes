import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { computeWeeklyWindow } from "./lib/window.js";
import { loadChangelogSource, parseMarkdownChangelog } from "./lib/changelogSource.js";
import type { ExtractionResult } from "./lib/types.js";

const ARTIFACTS_DIR = "artifacts";

async function main() {
  const sourcePath = process.env.CHANGELOG_SOURCE_PATH;
  if (!sourcePath) {
    throw new Error(
      "CHANGELOG_SOURCE_PATH is not set. Configure it as a repository variable or secret."
    );
  }

  const window = computeWeeklyWindow();
  console.log(`Window: (${window.startTime}, ${window.endTime}]`);
  console.log(`IST calendar bound: (${window.startDateIst}, ${window.endDateIst}]`);

  const raw = await loadChangelogSource(sourcePath);
  const entries = parseMarkdownChangelog(raw, window.startDateIst, window.endDateIst);

  const result: ExtractionResult = {
    start_time: window.startTime,
    end_time: window.endTime,
    entries,
  };

  await mkdir(ARTIFACTS_DIR, { recursive: true });
  await writeFile(path.join(ARTIFACTS_DIR, "raw-changelog.json"), JSON.stringify(result, null, 2));

  const uniquePrs = new Set(entries.flatMap((e) => e.prNumbers));
  console.log(`Extracted ${entries.length} entr(ies) covering ${uniquePrs.size} unique PR(s).`);

  if (entries.length === 0) {
    console.log("No changelog entries found in this window.");
  }
}

main().catch((err) => {
  console.error("Changelog extraction failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
