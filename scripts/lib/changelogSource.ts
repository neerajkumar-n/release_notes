import { readFile } from "node:fs/promises";
import type { ChangelogEntry } from "./types.js";

/**
 * Loads raw changelog content from CHANGELOG_SOURCE_PATH, which may be an
 * http(s) URL (fetched directly) or a local filesystem path (e.g. when this
 * runs inside a checkout of the source repository).
 */
export async function loadChangelogSource(sourcePath: string): Promise<string> {
  if (/^https?:\/\//i.test(sourcePath)) {
    const res = await fetch(sourcePath);
    if (!res.ok) {
      throw new Error(
        `Failed to fetch changelog source (${res.status} ${res.statusText}): ${sourcePath}`
      );
    }
    return await res.text();
  }
  return await readFile(sourcePath, "utf8");
}

const VERSION_RE = /^## ((\d{4}\.\d{2}\.\d{2})\.\d+)/;
const CATEGORY_RE = /^### (.+)/;
const SUB_BULLET_RE = /^ {2}- (.*)$/;
const TOP_BULLET_RE = /^- (.*)$/;
const SCOPE_RE = /^\*\*([^*]+)\*\*\s*(.*)$/;
const PR_LINK_RE = /\[#(\d+)\]\(https:\/\/github\.com\/juspay\/hyperswitch\/pull\/(\d+)\)/g;
const COMMIT_LINK_RE = /\(\[`[0-9a-f]+`\]\([^)]*\)\)/g;

function extractPrs(text: string): { numbers: number[]; links: string[] } {
  const numbers: number[] = [];
  const links: string[] = [];
  for (const match of text.matchAll(PR_LINK_RE)) {
    numbers.push(Number(match[2]));
    links.push(`https://github.com/juspay/hyperswitch/pull/${match[2]}`);
  }
  return { numbers, links };
}

function cleanDescription(text: string): string {
  return text
    .replace(COMMIT_LINK_RE, "")
    .replace(PR_LINK_RE, "")
    .replace(/\(\s*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parses a release-please style markdown changelog:
 *   ## YYYY.MM.DD.N
 *   ### Category
 *   - **scope:** Description ([#123](.../pull/123)) ([`hash`](.../commit/hash))
 *   - **scope:**
 *     - Sub-entry description ([#124](.../pull/124)) ([`hash`](...))
 *
 * Only entries whose version date falls in (startDateIst, endDateIst] are
 * returned — i.e. strictly after the exclusive start day, up to and
 * including the inclusive end day.
 *
 * This parser is specific to the release-please changelog format used by
 * juspay/hyperswitch. To support a different CHANGELOG_SOURCE_PATH shape
 * (e.g. plain commit history or a release-notes API), add a sibling parser
 * here and select it based on source format/configuration.
 */
export function parseMarkdownChangelog(
  text: string,
  startDateIst: string,
  endDateIst: string
): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  let currentVersion: string | null = null;
  let currentDate: string | null = null;
  let inRange = false;
  let currentCategory: string | null = null;
  let currentScope: string | null = null;

  for (const line of text.split("\n")) {
    const versionMatch = VERSION_RE.exec(line);
    if (versionMatch) {
      currentVersion = versionMatch[1];
      currentDate = versionMatch[2].replace(/\./g, "-");
      inRange = currentDate > startDateIst && currentDate <= endDateIst;
      currentCategory = null;
      currentScope = null;
      continue;
    }

    if (!inRange || !currentDate || !currentVersion) continue;

    const categoryMatch = CATEGORY_RE.exec(line);
    if (categoryMatch) {
      currentCategory = categoryMatch[1].trim();
      currentScope = null;
      continue;
    }

    const subMatch = SUB_BULLET_RE.exec(line);
    if (subMatch && currentScope) {
      const { numbers, links } = extractPrs(subMatch[1]);
      if (numbers.length > 0) {
        entries.push({
          version: currentVersion,
          date: currentDate,
          category: currentCategory,
          scope: currentScope,
          description: cleanDescription(subMatch[1]),
          prNumbers: numbers,
          prLinks: links,
        });
      }
      continue;
    }

    const topMatch = TOP_BULLET_RE.exec(line);
    if (topMatch) {
      const bulletText = topMatch[1];
      const scopeMatch = SCOPE_RE.exec(bulletText);
      let rest = bulletText;

      if (scopeMatch) {
        currentScope = scopeMatch[1].replace(/:$/, "").trim();
        rest = scopeMatch[2].trim();
      } else {
        currentScope = null;
      }

      if (rest) {
        const { numbers, links } = extractPrs(rest);
        if (numbers.length > 0) {
          entries.push({
            version: currentVersion,
            date: currentDate,
            category: currentCategory,
            scope: currentScope,
            description: cleanDescription(rest),
            prNumbers: numbers,
            prLinks: links,
          });
        }
      }
    }
  }

  return entries;
}
