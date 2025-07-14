/**
 * OpenAI SDK Telemetry Attributes
 * Based on OpenAI API response structure and common AI telemetry patterns
 */

// =============================================================================
// REQUEST ATTRIBUTES
// =============================================================================

/**
 * The method that was called (e.g., 'responses.create', 'chat.completions.create')
 */
export const OPENAI_REQUEST_METHOD_ATTRIBUTE = 'openai.request.method';

/**
 * The model identifier used for the request
 */
export const OPENAI_REQUEST_MODEL_ATTRIBUTE = 'openai.request.model';

/**
 * Whether streaming was enabled for the request
 */
export const OPENAI_REQUEST_STREAM_ATTRIBUTE = 'openai.request.stream';

// =============================================================================
// RESPONSE ATTRIBUTES
// =============================================================================

/**
 * The response ID returned by OpenAI
 */
export const OPENAI_RESPONSE_ID_ATTRIBUTE = 'openai.response.id';

/**
 * The request ID for tracking purposes
 */
export const OPENAI_RESPONSE_REQUEST_ID_ATTRIBUTE = 'openai.response.request_id';

// =============================================================================
// USAGE ATTRIBUTES (TOKEN COUNTS)
// =============================================================================

/**
 * Number of tokens in the input/prompt
 */
export const OPENAI_USAGE_PROMPT_TOKENS_ATTRIBUTE = 'openai.usage.prompt_tokens';

/**
 * Number of tokens in the completion/response
 */
export const OPENAI_USAGE_COMPLETION_TOKENS_ATTRIBUTE = 'openai.usage.completion_tokens';

/**
 * Total number of tokens used (prompt + completion)
 */
export const OPENAI_USAGE_TOTAL_TOKENS_ATTRIBUTE = 'openai.usage.total_tokens';

// =============================================================================
// CHAT COMPLETIONS SPECIFIC ATTRIBUTES
// =============================================================================

/**
 * Number of input messages in chat completion request
 */
export const OPENAI_CHAT_MESSAGES_COUNT_ATTRIBUTE = 'openai.chat.messages.count';

/**
 * Number of response choices returned
 */
export const OPENAI_CHAT_RESPONSE_CHOICES_COUNT_ATTRIBUTE = 'openai.chat.response.choices.count';

/**
 * The reason why the generation finished (e.g., 'stop', 'length', 'function_call')
 */
export const OPENAI_CHAT_RESPONSE_FINISH_REASON_ATTRIBUTE = 'openai.chat.response.finish_reason';

/**
 * Number of tool calls made in the response
 */
export const OPENAI_CHAT_TOOL_CALLS_COUNT_ATTRIBUTE = 'openai.chat.tool_calls.count';

// =============================================================================
// RESPONSES API SPECIFIC ATTRIBUTES
// =============================================================================

/**
 * The input text/prompt for responses API (if recording enabled)
 */
export const OPENAI_RESPONSES_INPUT_ATTRIBUTE = 'openai.responses.input';

/**
 * The system instructions for responses API (if recording enabled)
 */
export const OPENAI_RESPONSES_INSTRUCTIONS_ATTRIBUTE = 'openai.responses.instructions';

/**
 * The generated response text (if recording enabled)
 */
export const OPENAI_RESPONSES_OUTPUT_ATTRIBUTE = 'openai.responses.output';

// =============================================================================
// STREAMING METRICS
// =============================================================================

/**
 * Time in milliseconds until the first token was received
 */
export const OPENAI_STREAM_TIME_TO_FIRST_TOKEN_MS_ATTRIBUTE = 'openai.stream.time_to_first_token_ms';

/**
 * Total time in milliseconds for the streaming operation
 */
export const OPENAI_STREAM_TOTAL_TIME_MS_ATTRIBUTE = 'openai.stream.total_time_ms';

/**
 * Average tokens per second during streaming
 */
export const OPENAI_STREAM_TOKENS_PER_SECOND_ATTRIBUTE = 'openai.stream.tokens_per_second';

// =============================================================================
// SEMANTIC CONVENTIONS MAPPING
// =============================================================================

/**
 * Maps OpenAI attributes to standard GenAI semantic conventions where applicable
 */
export const OPENAI_TO_GENAI_ATTRIBUTE_MAPPING = {
  [OPENAI_REQUEST_MODEL_ATTRIBUTE]: 'gen_ai.request.model',
  [OPENAI_RESPONSE_ID_ATTRIBUTE]: 'gen_ai.response.id',
  [OPENAI_USAGE_PROMPT_TOKENS_ATTRIBUTE]: 'gen_ai.usage.input_tokens',
  [OPENAI_USAGE_COMPLETION_TOKENS_ATTRIBUTE]: 'gen_ai.usage.output_tokens',
  [OPENAI_CHAT_RESPONSE_FINISH_REASON_ATTRIBUTE]: 'gen_ai.response.finish_reasons',
} as const;

// =============================================================================
// SPAN ATTRIBUTE COLLECTIONS
// =============================================================================

/**
 * Common attributes for all OpenAI operations
 */
export const OPENAI_COMMON_ATTRIBUTES = {
  REQUEST_METHOD: OPENAI_REQUEST_METHOD_ATTRIBUTE,
  REQUEST_MODEL: OPENAI_REQUEST_MODEL_ATTRIBUTE,
  REQUEST_STREAM: OPENAI_REQUEST_STREAM_ATTRIBUTE,
  RESPONSE_ID: OPENAI_RESPONSE_ID_ATTRIBUTE,
  RESPONSE_REQUEST_ID: OPENAI_RESPONSE_REQUEST_ID_ATTRIBUTE,
  USAGE_PROMPT_TOKENS: OPENAI_USAGE_PROMPT_TOKENS_ATTRIBUTE,
  USAGE_COMPLETION_TOKENS: OPENAI_USAGE_COMPLETION_TOKENS_ATTRIBUTE,
  USAGE_TOTAL_TOKENS: OPENAI_USAGE_TOTAL_TOKENS_ATTRIBUTE,
} as const;

/**
 * Attributes specific to chat completions
 */
export const OPENAI_CHAT_COMPLETIONS_ATTRIBUTES = {
  ...OPENAI_COMMON_ATTRIBUTES,
  MESSAGES_COUNT: OPENAI_CHAT_MESSAGES_COUNT_ATTRIBUTE,
  RESPONSE_CHOICES_COUNT: OPENAI_CHAT_RESPONSE_CHOICES_COUNT_ATTRIBUTE,
  RESPONSE_FINISH_REASON: OPENAI_CHAT_RESPONSE_FINISH_REASON_ATTRIBUTE,
  TOOL_CALLS_COUNT: OPENAI_CHAT_TOOL_CALLS_COUNT_ATTRIBUTE,
} as const;

/**
 * Attributes specific to responses API
 */
export const OPENAI_RESPONSES_ATTRIBUTES = {
  ...OPENAI_COMMON_ATTRIBUTES,
  INPUT: OPENAI_RESPONSES_INPUT_ATTRIBUTE,
  INSTRUCTIONS: OPENAI_RESPONSES_INSTRUCTIONS_ATTRIBUTE,
  OUTPUT: OPENAI_RESPONSES_OUTPUT_ATTRIBUTE,
} as const;

/**
 * Attributes for streaming operations
 */
export const OPENAI_STREAMING_ATTRIBUTES = {
  TIME_TO_FIRST_TOKEN_MS: OPENAI_STREAM_TIME_TO_FIRST_TOKEN_MS_ATTRIBUTE,
  TOTAL_TIME_MS: OPENAI_STREAM_TOTAL_TIME_MS_ATTRIBUTE,
  TOKENS_PER_SECOND: OPENAI_STREAM_TOKENS_PER_SECOND_ATTRIBUTE,
} as const;