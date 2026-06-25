# Weekly HyperSwitch Changelog Automation

A fully automated, schedule-only GitHub Actions workflow that extracts the
past week's changelog entries, summarizes them with an AI model, and
publishes the result to Sanity CMS. No manual trigger exists — the only way
this runs is the weekly cron.

## Architecture

```
.github/workflows/
  weekly-changelog.yml      # extract -> summarize -> publish jobs

scripts/
  fetch-changelog.ts        # entry point: compute window, load + parse source, write artifacts/raw-changelog.json
  summarize.ts               # entry point: load prompt template, call AI, write artifacts/ai-request.json + summary.md
  publish-to-sanity.ts       # entry point: build payload, call publishWeeklySummary()
  lib/
    types.ts                # shared interfaces (ChangelogEntry, ExtractionResult, SummaryPayload)
    window.ts                # weekly window math (IST <-> UTC, exclusive/inclusive bounds)
    changelogSource.ts       # loadChangelogSource() (http or fs) + parseMarkdownChangelog()
    aiClient.ts               # AIRequestAdapter interface + summarizeWithAI() — provider-agnostic
    sanityClient.ts          # publishWeeklySummary() abstraction over @sanity/client

templates/
  weekly_summary_prompt.md  # system prompt, loaded dynamically — no prompt text in source code

artifacts/                  # runtime-only outputs (gitignored), uploaded as GitHub Artifacts each run
```

Each script is a standalone CLI entry point so the three pipeline stages map
directly onto three GitHub Actions jobs, with artifacts handed off between
them via `actions/upload-artifact` / `download-artifact`.

## Required secrets and variables

| Name | Kind | Sensitive? | Purpose |
|---|---|---|---|
| `CHANGELOG_SOURCE_PATH` | variable | No | URL or filesystem path to the changelog source (e.g. `https://raw.githubusercontent.com/juspay/hyperswitch/main/CHANGELOG.md`) |
| `AI_API_BASE_URL` | variable | No | Internal Juspay LLM endpoint |
| `AI_API_KEY` | **secret** | Yes | Bearer token for the AI endpoint |
| `AI_MODEL_NAME` | variable | No | Model identifier sent in the request body |
| `SANITY_PROJECT_ID` | variable | No | Sanity project ID |
| `SANITY_DATASET` | variable | No | Sanity dataset name |
| `SANITY_API_TOKEN` | **secret** | Yes | Sanity Editor-permission token |
| `SANITY_DOCUMENT_TYPE` | variable | No | `_type` to publish documents as |

Configure variables under **Settings → Secrets and variables → Actions →
Variables**, and secrets under the **Secrets** tab of the same page. If you'd
rather treat any of the "variable" rows as sensitive, just change the
corresponding `vars.X` to `secrets.X` in `weekly-changelog.yml` — the scripts
only read `process.env.X` and don't care which GitHub mechanism populated it.

None of these values are committed anywhere in this repo.

## Deployment

1. Set the secrets/variables above.
2. Push to the default branch — the workflow is picked up automatically by
   GitHub Actions; no further setup is needed.
3. The first real run happens at the next Wednesday 04:30 UTC boundary. To
   verify sooner without adding a manual trigger, see **Local testing** below,
   or temporarily add a `workflow_dispatch:` trigger for a one-off test run
   and remove it afterward to preserve the "zero manual intervention"
   requirement.

## Local testing

```bash
npm install
npm run typecheck

# 1. Extract — point at the real source, override the window explicitly
CHANGELOG_SOURCE_PATH="https://raw.githubusercontent.com/juspay/hyperswitch/main/CHANGELOG.md" \
WINDOW_START_ISO="2026-06-17T04:30:00.000Z" \
WINDOW_END_ISO="2026-06-24T04:30:00.000Z" \
npm run fetch-changelog
# -> artifacts/raw-changelog.json

# 2. Summarize — requires a reachable AI endpoint
AI_API_BASE_URL="https://your-ai-endpoint" \
AI_API_KEY="..." \
AI_MODEL_NAME="..." \
npm run summarize
# -> artifacts/ai-request.json, artifacts/summary.md

# 3. Publish — requires a real Sanity token
SANITY_PROJECT_ID="..." \
SANITY_DATASET="..." \
SANITY_API_TOKEN="..." \
SANITY_DOCUMENT_TYPE="weekly_changelog_summary" \
npm run publish
```

`WINDOW_START_ISO` / `WINDOW_END_ISO` only affect step 1 (they're read by
`computeWeeklyWindow()` in `scripts/lib/window.ts`); omit them to use "7 days
ago through now," which is what the scheduled run does implicitly.

## Cron scheduling and timezone handling

GitHub Actions cron is UTC-only. India Standard Time is a fixed UTC+05:30
offset with no daylight saving, so the conversion is static:

```
10:00 AM IST  =  04:30 AM UTC
```

Hence:

```yaml
on:
  schedule:
    - cron: '30 4 * * 3'   # Wednesday 04:30 UTC = Wednesday 10:00 IST
```

`computeWeeklyWindow()` treats the run's `now` as the inclusive upper bound
and `now - 7 days` as the exclusive lower bound, then derives the IST
calendar date of each for use by the changelog parser.

**Caveat:** the changelog source itself (`## YYYY.MM.DD.N` version headers)
only records a calendar date, not a time-of-day. There's no way to tell
whether an entry on the boundary day landed before or after 10:00 AM. This
implementation resolves that by excluding the entire exclusive-boundary day
and including the entire inclusive-boundary day — i.e. it operates on the
half-open day interval `(startDateIst, endDateIst]`. If `CHANGELOG_SOURCE_PATH`
is later swapped for a source with real timestamps (e.g. raw commit history),
`changelogSource.ts` should be extended with a parser that filters on the
precise ISO instants instead of calendar dates.

## Failure behavior

- Each script throws on missing config or a bad response and exits with code
  1, which fails its job and therefore the whole run.
- Every artifact-upload step uses `if: always()`, so partial state (e.g. a
  successful extraction with a failed AI call) is still uploaded for
  debugging, with `retention-days: 3`.
- Downstream jobs (`summarize`, `publish`) are skipped — not silently
  succeeded — when there are zero changelog entries for the window
  (`needs.extract.outputs.has_entries`).

## Extending

- **Different changelog source shape:** add a new parser alongside
  `parseMarkdownChangelog` in `scripts/lib/changelogSource.ts` and select it
  based on configuration.
- **Different AI provider contract:** implement `AIRequestAdapter` in
  `scripts/lib/aiClient.ts` and pass it to `summarizeWithAI()`.
- **Different Sanity schema:** edit the document shape inside
  `publishWeeklySummary()` in `scripts/lib/sanityClient.ts` — the function
  signature is intentionally stable so `publish-to-sanity.ts` doesn't need to
  change.
- **Different summarization instructions:** edit
  `templates/weekly_summary_prompt.md` directly; no code changes needed.
