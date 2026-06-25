import { createClient, type SanityClient } from "@sanity/client";
import type { SummaryPayload } from "./types.js";

export interface SanityConfig {
  projectId: string;
  dataset: string;
  apiToken: string;
  documentType: string;
}

function buildClient(config: SanityConfig): SanityClient {
  return createClient({
    projectId: config.projectId,
    dataset: config.dataset,
    apiVersion: "2024-01-01",
    token: config.apiToken,
    useCdn: false,
  });
}

/**
 * Publishes a weekly summary to Sanity.
 *
 * The document shape below is a placeholder pending the real Sanity schema
 * and payload structure — once that's provided, replace the body of this
 * function (the public `publishWeeklySummary(summaryPayload)` signature can
 * stay the same so callers don't need to change).
 *
 * `_id` is deterministic (keyed by weekStart) so reruns are idempotent via
 * createOrReplace.
 */
export async function publishWeeklySummary(summaryPayload: SummaryPayload, config: SanityConfig) {
  const client = buildClient(config);

  const doc = {
    _id: `weekly-changelog-summary-${summaryPayload.weekStart}`,
    _type: config.documentType,
    weekStart: summaryPayload.weekStart,
    weekEnd: summaryPayload.weekEnd,
    entryCount: summaryPayload.entryCount,
    generatedAt: summaryPayload.generatedAt,
    summaryMarkdown: summaryPayload.markdown,
  };

  return client.createOrReplace(doc);
}
