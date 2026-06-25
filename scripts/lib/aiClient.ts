/**
 * Adapter that knows how to shape a request for a specific AI provider and
 * how to pull the generated text back out of its response. Swap in a
 * different adapter (or write a new one) when the internal Juspay LLM's
 * actual contract is known — summarizeWithAI() does not assume OpenAI
 * compatibility beyond this interface.
 */
export interface AIRequestAdapter {
  buildRequest(systemPrompt: string, userContent: string, model: string): unknown;
  parseResponse(responseBody: unknown): string;
}

/**
 * Default adapter for chat-completions-shaped endpoints:
 *   request:  { model, messages: [{role, content}, ...] }
 *   response: { choices: [{ message: { content } }] }
 */
export const chatCompletionsAdapter: AIRequestAdapter = {
  buildRequest(systemPrompt, userContent, model) {
    return {
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
    };
  },
  parseResponse(responseBody) {
    const body = responseBody as { choices?: Array<{ message?: { content?: string } }> };
    const content = body?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error(
        `AI response did not contain choices[0].message.content: ${JSON.stringify(responseBody)}`
      );
    }
    return content;
  },
};

export interface AIClientConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  adapter?: AIRequestAdapter;
}

export async function summarizeWithAI(
  systemPrompt: string,
  userContent: string,
  config: AIClientConfig
): Promise<{ request: unknown; summary: string }> {
  const adapter = config.adapter ?? chatCompletionsAdapter;
  const request = adapter.buildRequest(systemPrompt, userContent, config.model);

  const response = await fetch(config.baseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "<unreadable body>");
    throw new Error(`AI request failed (${response.status} ${response.statusText}): ${errorBody}`);
  }

  const responseBody = await response.json();
  const summary = adapter.parseResponse(responseBody);

  if (!summary.trim()) {
    throw new Error("AI returned an empty summary");
  }

  return { request, summary };
}
