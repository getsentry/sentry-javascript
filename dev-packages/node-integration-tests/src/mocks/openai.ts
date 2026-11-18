interface OpenAiUsage {
  prompt_tokens: number;
  completion_tokens: number;
}

function withTotal(usage: OpenAiUsage): OpenAiUsage & { total_tokens: number } {
  return { ...usage, total_tokens: usage.prompt_tokens + usage.completion_tokens };
}

/** A non-streamed OpenAI-compatible `chat.completion` response. */
export function openAiChatCompletion(
  model: string,
  {
    id = 'chatcmpl-mock123',
    content = 'Hello from OpenAI mock!',
    toolCalls,
    usage = { prompt_tokens: 10, completion_tokens: 15 },
  }: { id?: string; content?: string | null; toolCalls?: unknown[]; usage?: OpenAiUsage } = {},
): Record<string, unknown> {
  return {
    id,
    object: 'chat.completion',
    created: 1677652288,
    model,
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content, ...(toolCalls && { tool_calls: toolCalls }) },
        finish_reason: toolCalls ? 'tool_calls' : 'stop',
      },
    ],
    usage: withTotal(usage),
  };
}

/** The chunks of a streamed OpenAI-compatible chat completion: role, then content, then finish reason and usage. */
export function openAiChatCompletionChunks(
  model: string,
  {
    id = 'chatcmpl-stream-123',
    content = 'Hello from OpenAI streaming!',
    usage = { prompt_tokens: 12, completion_tokens: 18 },
  }: { id?: string; content?: string; usage?: OpenAiUsage } = {},
): Record<string, unknown>[] {
  const chunk = (choice: Record<string, unknown>, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
    id,
    object: 'chat.completion.chunk',
    created: 1677652300,
    model,
    choices: [{ index: 0, finish_reason: null, ...choice }],
    ...extra,
  });

  return [
    chunk({ delta: { role: 'assistant', content: '' } }),
    chunk({ delta: { content } }),
    chunk({ delta: {}, finish_reason: 'stop' }, { usage: withTotal(usage) }),
  ];
}

/** An OpenAI-compatible `embeddings` response with `count` vectors. */
export function openAiEmbeddings(
  model: string,
  { id = 'embd-mock123', promptTokens = 8, count = 1 }: { id?: string; promptTokens?: number; count?: number } = {},
): Record<string, unknown> {
  return {
    id,
    object: 'list',
    model,
    data: Array.from({ length: count }, (_, index) => ({ object: 'embedding', index, embedding: [0.1, 0.2, 0.3] })),
    usage: { prompt_tokens: promptTokens, total_tokens: promptTokens },
  };
}

/** A non-streamed OpenAI Responses API response with one text output. */
export function openAiResponse(
  model: string,
  {
    id = 'resp_mock456',
    text,
    usage = { input_tokens: 5, output_tokens: 8 },
  }: { id?: string; text: string; usage?: { input_tokens: number; output_tokens: number } },
): Record<string, unknown> {
  return {
    id,
    object: 'response',
    created_at: 1677652290,
    model,
    output: [
      {
        type: 'message',
        id: 'msg_mock_output_1',
        status: 'completed',
        role: 'assistant',
        content: [{ type: 'output_text', text, annotations: [] }],
      },
    ],
    output_text: text,
    status: 'completed',
    usage: { ...usage, total_tokens: usage.input_tokens + usage.output_tokens },
  };
}
