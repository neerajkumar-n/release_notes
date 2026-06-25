export interface ChangelogEntry {
  version: string;
  date: string; // YYYY-MM-DD, calendar date as recorded by the source
  category: string | null;
  scope: string | null;
  description: string;
  prNumbers: number[];
  prLinks: string[];
}

export interface ExtractionResult {
  start_time: string; // ISO 8601 instant, exclusive lower bound
  end_time: string; // ISO 8601 instant, inclusive upper bound
  entries: ChangelogEntry[];
}

export interface SummaryPayload {
  weekStart: string;
  weekEnd: string;
  entryCount: number;
  generatedAt: string;
  markdown: string;
}
