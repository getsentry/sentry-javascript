/**
 * AI SDK Telemetry Attributes
 * Based on https://ai-sdk.dev/docs/ai-sdk-core/telemetry#collected-data
 */

// =============================================================================
// COMMON ATTRIBUTES
// =============================================================================

/**
 * Common attribute for operation name across all functions and spans
 * @see https://ai-sdk.dev/docs/ai-sdk-core/telemetry#collected-data
 */
export const OPERATION_NAME_ATTRIBUTE = 'operation.name';

/**
 * Common attribute for AI operation ID across all functions and spans
 * @see https://ai-sdk.dev/docs/ai-sdk-core/telemetry#collected-data
 */
export const AI_OPERATION_ID_ATTRIBUTE = 'vercel.ai.operationId';

// =============================================================================
// SHARED ATTRIBUTES
// =============================================================================

/**
 * `generateText` function - `ai.generateText` span
 * `streamText` function - `ai.streamText` span
 *
 * The prompt that was used when calling the function
 * @see https://ai-sdk.dev/docs/ai-sdk-core/telemetry#generatetext-function
 * @see https://ai-sdk.dev/docs/ai-sdk-core/telemetry#streamtext-function
 */
export const AI_PROMPT_ATTRIBUTE = 'vercel.ai.prompt';

/**
 * `generateObject` function - `ai.generateObject` span
 * `streamObject` function - `ai.streamObject` span
 *
 * The JSON schema version of the schema that was passed into the function
 * @see https://ai-sdk.dev/docs/ai-sdk-core/telemetry#generateobject-function
 * @see https://ai-sdk.dev/docs/ai-sdk-core/telemetry#streamobject-function
 */
export const AI_SCHEMA_ATTRIBUTE = 'vercel.ai.schema';

/**
 * `generateObject` function - `ai.generateObject` span
 * `streamObject` function - `ai.streamObject` span
 *
 * The name of the schema that was passed into the function
 * @see https://ai-sdk.dev/docs/ai-sdk-core/telemetry#generateobject-function
 * @see https://ai-sdk.dev/docs/ai-sdk-core/telemetry#streamobject-function
 */
export const AI_SCHEMA_NAME_ATTRIBUTE = 'vercel.ai.schema.name';

/**
 * `generateObject` function - `ai.generateObject` span
 * `streamObject` function - `ai.streamObject` span
 *
 * The description of the schema that was passed into the function
 * @see https://ai-sdk.dev/docs/ai-sdk-core/telemetry#generateobject-function
 * @see https://ai-sdk.dev/docs/ai-sdk-core/telemetry#streamobject-function
 */
export const AI_SCHEMA_DESCRIPTION_ATTRIBUTE = 'vercel.ai.schema.description';

/**
 * `generateObject` function - `ai.generateObject` span
 * `streamObject` function - `ai.streamObject` span
 *
 * The object that was generated (stringified JSON)
 * @see https://ai-sdk.dev/docs/ai-sdk-core/telemetry#generateobject-function
 * @see https://ai-sdk.dev/docs/ai-sdk-core/telemetry#streamobject-function
 */
export const AI_RESPONSE_OBJECT_ATTRIBUTE = 'vercel.ai.response.object';

/**
 * `generateObject` function - `ai.generateObject` span
 * `streamObject` function - `ai.streamObject` span
 *
 * The object generation mode, e.g. `json`
 * @see https://ai-sdk.dev/docs/ai-sdk-core/telemetry#generateobject-function
 * @see https://ai-sdk.dev/docs/ai-sdk-core/telemetry#streamobject-function
 */
export const AI_SETTINGS_MODE_ATTRIBUTE = 'vercel.ai.settings.mode';

/**
 * `generateObject` function - `ai.generateObject` span
 * `streamObject` function - `ai.streamObject` span
 *
 * The output type that was used, e.g. `object` or `no-schema`
 * @see https://ai-sdk.dev/docs/ai-sdk-core/telemetry#generateobject-function
 * @see https://ai-sdk.dev/docs/ai-sdk-core/telemetry#streamobject-function
 */
export const AI_SETTINGS_OUTPUT_ATTRIBUTE = 'vercel.ai.settings.output';

/**
 * `embed` function - `ai.embed.doEmbed` span
 * `embedMany` function - `ai.embedMany` span
 *
 * The values that were passed into the function (array)
 * @see https://ai-sdk.dev/docs/ai-sdk-core/telemetry#embed-function
 * @see https://ai-sdk.dev/docs/ai-sdk-core/telemetry#embedmany-function
 */
export const AI_VALUES_ATTRIBUTE = 'vercel.ai.values';

/**
 * `embed` function - `ai.embed.doEmbed` span
 * `embedMany` function - `ai.embedMany` span
 *
 * An array of JSON-stringified embeddings
 * @see https://ai-sdk.dev/docs/ai-sdk-core/telemetry#embed-function
 * @see https://ai-sdk.dev/docs/ai-sdk-core/telemetry#embedmany-function
 */
export const AI_EMBEDDINGS_ATTRIBUTE = 'vercel.ai.embeddings';

// =============================================================================
// GENERATETEXT FUNCTION - UNIQUE ATTRIBUTES
// =============================================================================

/**
 * `generateText` function - `ai.generateText` span
 *
 * The text that was generated
 * @see https://ai-sdk.dev/docs/ai-sdk-core/telemetry#generatetext-function
 */
export const AI_RESPONSE_TEXT_ATTRIBUTE = 'vercel.ai.response.text';

/**
 * `generateText` function - `ai.generateText` span
 *
 * The tool calls that were made as part of the generation (stringified JSON)
 * @see https://ai-sdk.dev/docs/ai-sdk-core/telemetry#generatetext-function
 */
export const AI_RESPONSE_TOOL_CALLS_ATTRIBUTE = 'vercel.ai.response.toolCalls';

/**
 * `generateText` function - `ai.generateText` span
 *
 * The reason why the generation finished
 * @see https://ai-sdk.dev/docs/ai-sdk-core/telemetry#generatetext-function
 */
export const AI_RESPONSE_FINISH_REASON_ATTRIBUTE = 'vercel.ai.response.finishReason';

/**
 * `generateText` function - `ai.generateText` span
 *
 * The maximum number of steps that were set
 * @see https://ai-sdk.dev/docs/ai-sdk-core/telemetry#generatetext-function
 */
export const AI_SETTINGS_MAX_STEPS_ATTRIBUTE = 'vercel.ai.settings.maxSteps';

/**
 * `generateText` function - `ai.generateText.doGenerate` span
 *
 * The format of the prompt
 * @see https://ai-sdk.dev/docs/ai-sdk-core/telemetry#generatetext-function
 */
export const AI_PROMPT_FORMAT_ATTRIBUTE = 'vercel.ai.prompt.format';

/**
 * `generateText` function - `ai.generateText.doGenerate` span
 *
 * The messages that were passed into the provider
 * @see https://ai-sdk.dev/docs/ai-sdk-core/telemetry#generatetext-function
 */
export const AI_PROMPT_MESSAGES_ATTRIBUTE = 'vercel.ai.prompt.messages';

/**
 * `generateText` function - `ai.generateText.doGenerate` span
 *
 * Array of stringified tool definitions
 * @see https://ai-sdk.dev/docs/ai-sdk-core/telemetry#generatetext-function
 */
export const AI_PROMPT_TOOLS_ATTRIBUTE = 'vercel.ai.prompt.tools';

/**
 * `generateText` function - `ai.generateText.doGenerate` span
 *
 * The stringified tool choice setting (JSON)
 * @see https://ai-sdk.dev/docs/ai-sdk-core/telemetry#generatetext-function
 */
export const AI_PROMPT_TOOL_CHOICE_ATTRIBUTE = 'vercel.ai.prompt.toolChoice';

// =============================================================================
// STREAMTEXT FUNCTION - UNIQUE ATTRIBUTES
// =============================================================================

/**
 * `streamText` function - `ai.streamText.doStream` span
 *
 * The time it took to receive the first chunk in milliseconds
 * @see https://ai-sdk.dev/docs/ai-sdk-core/telemetry#streamtext-function
 */
export const AI_RESPONSE_MS_TO_FIRST_CHUNK_ATTRIBUTE = 'vercel.ai.response.msToFirstChunk';

/**
 * `streamText` function - `ai.streamText.doStream` span
 *
 * The time it took to receive the finish part of the LLM stream in milliseconds
 * @see https://ai-sdk.dev/docs/ai-sdk-core/telemetry#streamtext-function
 */
export const AI_RESPONSE_MS_TO_FINISH_ATTRIBUTE = 'vercel.ai.response.msToFinish';

/**
 * `streamText` function - `ai.streamText.doStream` span
 *
 * The average completion tokens per second
 * @see https://ai-sdk.dev/docs/ai-sdk-core/telemetry#streamtext-function
 */
export const AI_RESPONSE_AVG_COMPLETION_TOKENS_PER_SECOND_ATTRIBUTE = 'vercel.ai.response.avgCompletionTokensPerSecond';

// =============================================================================
// EMBED FUNCTION - UNIQUE ATTRIBUTES
// =============================================================================

/**
 * `embed` function - `ai.embed` span
 *
 * The value that was passed into the `embed` function
 * @see https://ai-sdk.dev/docs/ai-sdk-core/telemetry#embed-function
 */
export const AI_VALUE_ATTRIBUTE = 'vercel.ai.value';

/**
 * `embed` function - `ai.embed` span
 *
 * A JSON-stringified embedding
 * @see https://ai-sdk.dev/docs/ai-sdk-core/telemetry#embed-function
 */
export const AI_EMBEDDING_ATTRIBUTE = 'vercel.ai.embedding';

// =============================================================================
// BASIC LLM SPAN INFORMATION
// =============================================================================

/**
 * Basic LLM span information
 * Multiple spans
 *
 * The functionId that was set through `telemetry.functionId`
 * @see https://ai-sdk.dev/docs/ai-sdk-core/telemetry#basic-llm-span-information
 */
export const RESOURCE_NAME_ATTRIBUTE = 'resource.name';

/**
 * Basic LLM span information
 * Multiple spans
 *
 * The id of the model
 * @see https://ai-sdk.dev/docs/ai-sdk-core/telemetry#basic-llm-span-information
 */
export const AI_MODEL_ID_ATTRIBUTE = 'vercel.ai.model.id';

/**
 * Basic LLM span information
 * Multiple spans
 *
 * The provider of the model
 * @see https://ai-sdk.dev/docs/ai-sdk-core/telemetry#basic-llm-span-information
 */
export const AI_MODEL_PROVIDER_ATTRIBUTE = 'vercel.ai.model.provider';

/**
 * Basic LLM span information
 * Multiple spans
 *
 * The request headers that were passed in through `headers`
 * @see https://ai-sdk.dev/docs/ai-sdk-core/telemetry#basic-llm-span-information
 */
export const AI_REQUEST_HEADERS_ATTRIBUTE = 'vercel.ai.request.headers';

/**
 * Basic LLM span information
 * Multiple spans
 *
 * The maximum number of retries that were set
 * @see https://ai-sdk.dev/docs/ai-sdk-core/telemetry#basic-llm-span-information
 */
export const AI_SETTINGS_MAX_RETRIES_ATTRIBUTE = 'vercel.ai.settings.maxRetries';

/**
 * Basic LLM span information
 * Multiple spans
 *
 * The functionId that was set through `telemetry.functionId`
 * @see https://ai-sdk.dev/docs/ai-sdk-core/telemetry#basic-llm-span-information
 */
export const AI_TELEMETRY_FUNCTION_ID_ATTRIBUTE = 'vercel.ai.telemetry.functionId';

/**
 * Basic LLM span information
 * Multiple spans
 *
 * The metadata that was passed in through `telemetry.metadata`
 * @see https://ai-sdk.dev/docs/ai-sdk-core/telemetry#basic-llm-span-information
 */
export const AI_TELEMETRY_METADATA_ATTRIBUTE = 'vercel.ai.telemetry.metadata';

/**
 * Basic LLM span information
 * Multiple spans
 *
 * The number of completion tokens that were used
 * @see https://ai-sdk.dev/docs/ai-sdk-core/telemetry#basic-llm-span-information
 */
export const AI_USAGE_COMPLETION_TOKENS_ATTRIBUTE = 'vercel.ai.usage.completionTokens';

/**
 * Basic LLM span information
 * Multiple spans
 *
 * The number of prompt tokens that were used
 * @see https://ai-sdk.dev/docs/ai-sdk-core/telemetry#basic-llm-span-information
 */
export const AI_USAGE_PROMPT_TOKENS_ATTRIBUTE = 'vercel.ai.usage.promptTokens';

// =============================================================================
// CALL LLM SPAN INFORMATION
// =============================================================================

/**
 * Call LLM span information
 * Individual LLM call spans
 *
 * The model that was used to generate the response
 * @see https://ai-sdk.dev/docs/ai-sdk-core/telemetry#call-llm-span-information
 */
export const AI_RESPONSE_MODEL_ATTRIBUTE = 'vercel.ai.response.model';

/**
 * Call LLM span information
 * Individual LLM call spans
 *
 * The id of the response
 * @see https://ai-sdk.dev/docs/ai-sdk-core/telemetry#call-llm-span-information
 */
export const AI_RESPONSE_ID_ATTRIBUTE = 'vercel.ai.response.id';

/**
 * Call LLM span information
 * Individual LLM call spans
 *
 * The timestamp of the response
 * @see https://ai-sdk.dev/docs/ai-sdk-core/telemetry#call-llm-span-information
 */
export const AI_RESPONSE_TIMESTAMP_ATTRIBUTE = 'vercel.ai.response.timestamp';

// =============================================================================
// SEMANTIC CONVENTIONS FOR GENAI OPERATIONS
// =============================================================================

/**
 * Semantic Conventions for GenAI operations
 * Individual LLM call spans
 *
 * The provider that was used
 * @see https://ai-sdk.dev/docs/ai-sdk-core/telemetry#call-llm-span-information
 */
export const GEN_AI_SYSTEM_ATTRIBUTE = 'gen_ai.system';

/**
 * Semantic Conventions for GenAI operations
 * Individual LLM call spans
 *
 * The model that was requested
 * @see https://ai-sdk.dev/docs/ai-sdk-core/telemetry#call-llm-span-information
 */
export const GEN_AI_REQUEST_MODEL_ATTRIBUTE = 'gen_ai.request.model';

/**
 * Semantic Conventions for GenAI operations
 * Individual LLM call spans
 *
 * The temperature that was set
 * @see https://ai-sdk.dev/docs/ai-sdk-core/telemetry#call-llm-span-information
 */
export const GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE = 'gen_ai.request.temperature';

/**
 * Semantic Conventions for GenAI operations
 * Individual LLM call spans
 *
 * The maximum number of tokens that were set
 * @see https://ai-sdk.dev/docs/ai-sdk-core/telemetry#call-llm-span-information
 */
export const GEN_AI_REQUEST_MAX_TOKENS_ATTRIBUTE = 'gen_ai.request.max_tokens';

/**
 * Semantic Conventions for GenAI operations
 * Individual LLM call spans
 *
 * The frequency penalty that was set
 * @see https://ai-sdk.dev/docs/ai-sdk-core/telemetry#call-llm-span-information
 */
export const GEN_AI_REQUEST_FREQUENCY_PENALTY_ATTRIBUTE = 'gen_ai.request.frequency_penalty';

/**
 * Semantic Conventions for GenAI operations
 * Individual LLM call spans
 *
 * The presence penalty that was set
 * @see https://ai-sdk.dev/docs/ai-sdk-core/telemetry#call-llm-span-information
 */
export const GEN_AI_REQUEST_PRESENCE_PENALTY_ATTRIBUTE = 'gen_ai.request.presence_penalty';

/**
 * Semantic Conventions for GenAI operations
 * Individual LLM call spans
 *
 * The topK parameter value that was set
 * @see https://ai-sdk.dev/docs/ai-sdk-core/telemetry#call-llm-span-information
 */
export const GEN_AI_REQUEST_TOP_K_ATTRIBUTE = 'gen_ai.request.top_k';

/**
 * Semantic Conventions for GenAI operations
 * Individual LLM call spans
 *
 * The topP parameter value that was set
 * @see https://ai-sdk.dev/docs/ai-sdk-core/telemetry#call-llm-span-information
 */
export const GEN_AI_REQUEST_TOP_P_ATTRIBUTE = 'gen_ai.request.top_p';

/**
 * Semantic Conventions for GenAI operations
 * Individual LLM call spans
 *
 * The stop sequences
 * @see https://ai-sdk.dev/docs/ai-sdk-core/telemetry#call-llm-span-information
 */
export const GEN_AI_REQUEST_STOP_SEQUENCES_ATTRIBUTE = 'gen_ai.request.stop_sequences';

/**
 * Semantic Conventions for GenAI operations
 * Individual LLM call spans
 *
 * The finish reasons that were returned by the provider
 * @see https://ai-sdk.dev/docs/ai-sdk-core/telemetry#call-llm-span-information
 */
export const GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE = 'gen_ai.response.finish_reasons';

/**
 * Semantic Conventions for GenAI operations
 * Individual LLM call spans
 *
 * The model that was used to generate the response
 * @see https://ai-sdk.dev/docs/ai-sdk-core/telemetry#call-llm-span-information
 */
export const GEN_AI_RESPONSE_MODEL_ATTRIBUTE = 'gen_ai.response.model';

/**
 * Semantic Conventions for GenAI operations
 * Individual LLM call spans
 *
 * The id of the response
 * @see https://ai-sdk.dev/docs/ai-sdk-core/telemetry#call-llm-span-information
 */
export const GEN_AI_RESPONSE_ID_ATTRIBUTE = 'gen_ai.response.id';

/**
 * Semantic Conventions for GenAI operations
 * Individual LLM call spans
 *
 * The number of prompt tokens that were used
 * @see https://ai-sdk.dev/docs/ai-sdk-core/telemetry#call-llm-span-information
 */
export const GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE = 'gen_ai.usage.input_tokens';

/**
 * Semantic Conventions for GenAI operations
 * Individual LLM call spans
 *
 * The number of completion tokens that were used
 * @see https://ai-sdk.dev/docs/ai-sdk-core/telemetry#call-llm-span-information
 */
export const GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE = 'gen_ai.usage.output_tokens';

// =============================================================================
// BASIC EMBEDDING SPAN INFORMATION
// =============================================================================

/**
 * Basic embedding span information
 * Embedding spans
 *
 * The number of tokens that were used
 * @see https://ai-sdk.dev/docs/ai-sdk-core/telemetry#basic-embedding-span-information
 */
export const AI_USAGE_TOKENS_ATTRIBUTE = 'vercel.ai.usage.tokens';

// =============================================================================
// TOOL CALL SPANS
// =============================================================================

/**
 * Tool call spans
 * `ai.toolCall` span
 *
 * The name of the tool
 * @see https://ai-sdk.dev/docs/ai-sdk-core/telemetry#tool-call-spans
 */
export const AI_TOOL_CALL_NAME_ATTRIBUTE = 'vercel.ai.toolCall.name';

/**
 * Tool call spans
 * `ai.toolCall` span
 *
 * The id of the tool call
 * @see https://ai-sdk.dev/docs/ai-sdk-core/telemetry#tool-call-spans
 */
export const AI_TOOL_CALL_ID_ATTRIBUTE = 'vercel.ai.toolCall.id';

/**
 * Tool call spans
 * `ai.toolCall` span
 *
 * The parameters of the tool call
 * @see https://ai-sdk.dev/docs/ai-sdk-core/telemetry#tool-call-spans
 */
export const AI_TOOL_CALL_ARGS_ATTRIBUTE = 'vercel.ai.toolCall.args';

/**
 * Tool call spans
 * `ai.toolCall` span
 *
 * The result of the tool call
 * @see https://ai-sdk.dev/docs/ai-sdk-core/telemetry#tool-call-spans
 */
export const AI_TOOL_CALL_RESULT_ATTRIBUTE = 'vercel.ai.toolCall.result';

// =============================================================================
// SPAN ATTRIBUTE OBJECTS
// =============================================================================

/**
 * Attributes collected for `ai.generateText` span
 * @see https://ai-sdk.dev/docs/ai-sdk-core/telemetry#generatetext-function
 */
export const AI_GENERATE_TEXT_SPAN_ATTRIBUTES = {
  OPERATION_NAME: OPERATION_NAME_ATTRIBUTE,
  AI_OPERATION_ID: AI_OPERATION_ID_ATTRIBUTE,
  AI_PROMPT: AI_PROMPT_ATTRIBUTE,
  AI_RESPONSE_TEXT: AI_RESPONSE_TEXT_ATTRIBUTE,
  AI_RESPONSE_TOOL_CALLS: AI_RESPONSE_TOOL_CALLS_ATTRIBUTE,
  AI_RESPONSE_FINISH_REASON: AI_RESPONSE_FINISH_REASON_ATTRIBUTE,
  AI_SETTINGS_MAX_STEPS: AI_SETTINGS_MAX_STEPS_ATTRIBUTE,
  // Basic LLM span information
  RESOURCE_NAME: RESOURCE_NAME_ATTRIBUTE,
  AI_MODEL_ID: AI_MODEL_ID_ATTRIBUTE,
  AI_MODEL_PROVIDER: AI_MODEL_PROVIDER_ATTRIBUTE,
  AI_REQUEST_HEADERS: AI_REQUEST_HEADERS_ATTRIBUTE,
  AI_SETTINGS_MAX_RETRIES: AI_SETTINGS_MAX_RETRIES_ATTRIBUTE,
  AI_TELEMETRY_FUNCTION_ID: AI_TELEMETRY_FUNCTION_ID_ATTRIBUTE,
  AI_TELEMETRY_METADATA: AI_TELEMETRY_METADATA_ATTRIBUTE,
  AI_USAGE_COMPLETION_TOKENS: AI_USAGE_COMPLETION_TOKENS_ATTRIBUTE,
  AI_USAGE_PROMPT_TOKENS: AI_USAGE_PROMPT_TOKENS_ATTRIBUTE,
} as const;

/**
 * Attributes collected for `ai.generateText.doGenerate` span
 * @see https://ai-sdk.dev/docs/ai-sdk-core/telemetry#generatetext-function
 */
export const AI_GENERATE_TEXT_DO_GENERATE_SPAN_ATTRIBUTES = {
  OPERATION_NAME: OPERATION_NAME_ATTRIBUTE,
  AI_OPERATION_ID: AI_OPERATION_ID_ATTRIBUTE,
  AI_PROMPT_FORMAT: AI_PROMPT_FORMAT_ATTRIBUTE,
  AI_PROMPT_MESSAGES: AI_PROMPT_MESSAGES_ATTRIBUTE,
  AI_PROMPT_TOOLS: AI_PROMPT_TOOLS_ATTRIBUTE,
  AI_PROMPT_TOOL_CHOICE: AI_PROMPT_TOOL_CHOICE_ATTRIBUTE,
  // Basic LLM span information
  RESOURCE_NAME: RESOURCE_NAME_ATTRIBUTE,
  AI_MODEL_ID: AI_MODEL_ID_ATTRIBUTE,
  AI_MODEL_PROVIDER: AI_MODEL_PROVIDER_ATTRIBUTE,
  AI_REQUEST_HEADERS: AI_REQUEST_HEADERS_ATTRIBUTE,
  AI_SETTINGS_MAX_RETRIES: AI_SETTINGS_MAX_RETRIES_ATTRIBUTE,
  AI_TELEMETRY_FUNCTION_ID: AI_TELEMETRY_FUNCTION_ID_ATTRIBUTE,
  AI_TELEMETRY_METADATA: AI_TELEMETRY_METADATA_ATTRIBUTE,
  AI_USAGE_COMPLETION_TOKENS: AI_USAGE_COMPLETION_TOKENS_ATTRIBUTE,
  AI_USAGE_PROMPT_TOKENS: AI_USAGE_PROMPT_TOKENS_ATTRIBUTE,
  // Call LLM span information
  AI_RESPONSE_MODEL: AI_RESPONSE_MODEL_ATTRIBUTE,
  AI_RESPONSE_ID: AI_RESPONSE_ID_ATTRIBUTE,
  AI_RESPONSE_TIMESTAMP: AI_RESPONSE_TIMESTAMP_ATTRIBUTE,
  // Semantic Conventions for GenAI operations
  GEN_AI_SYSTEM: GEN_AI_SYSTEM_ATTRIBUTE,
  GEN_AI_REQUEST_MODEL: GEN_AI_REQUEST_MODEL_ATTRIBUTE,
  GEN_AI_REQUEST_TEMPERATURE: GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE,
  GEN_AI_REQUEST_MAX_TOKENS: GEN_AI_REQUEST_MAX_TOKENS_ATTRIBUTE,
  GEN_AI_REQUEST_FREQUENCY_PENALTY: GEN_AI_REQUEST_FREQUENCY_PENALTY_ATTRIBUTE,
  GEN_AI_REQUEST_PRESENCE_PENALTY: GEN_AI_REQUEST_PRESENCE_PENALTY_ATTRIBUTE,
  GEN_AI_REQUEST_TOP_K: GEN_AI_REQUEST_TOP_K_ATTRIBUTE,
  GEN_AI_REQUEST_TOP_P: GEN_AI_REQUEST_TOP_P_ATTRIBUTE,
  GEN_AI_REQUEST_STOP_SEQUENCES: GEN_AI_REQUEST_STOP_SEQUENCES_ATTRIBUTE,
  GEN_AI_RESPONSE_FINISH_REASONS: GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE,
  GEN_AI_RESPONSE_MODEL: GEN_AI_RESPONSE_MODEL_ATTRIBUTE,
  GEN_AI_RESPONSE_ID: GEN_AI_RESPONSE_ID_ATTRIBUTE,
  GEN_AI_USAGE_INPUT_TOKENS: GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_OUTPUT_TOKENS: GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE,
} as const;

/**
 * Attributes collected for `ai.streamText` span
 * @see https://ai-sdk.dev/docs/ai-sdk-core/telemetry#streamtext-function
 */
export const AI_STREAM_TEXT_SPAN_ATTRIBUTES = {
  OPERATION_NAME: OPERATION_NAME_ATTRIBUTE,
  AI_OPERATION_ID: AI_OPERATION_ID_ATTRIBUTE,
  AI_PROMPT: AI_PROMPT_ATTRIBUTE,
  // Basic LLM span information
  RESOURCE_NAME: RESOURCE_NAME_ATTRIBUTE,
  AI_MODEL_ID: AI_MODEL_ID_ATTRIBUTE,
  AI_MODEL_PROVIDER: AI_MODEL_PROVIDER_ATTRIBUTE,
  AI_REQUEST_HEADERS: AI_REQUEST_HEADERS_ATTRIBUTE,
  AI_SETTINGS_MAX_RETRIES: AI_SETTINGS_MAX_RETRIES_ATTRIBUTE,
  AI_TELEMETRY_FUNCTION_ID: AI_TELEMETRY_FUNCTION_ID_ATTRIBUTE,
  AI_TELEMETRY_METADATA: AI_TELEMETRY_METADATA_ATTRIBUTE,
  AI_USAGE_COMPLETION_TOKENS: AI_USAGE_COMPLETION_TOKENS_ATTRIBUTE,
  AI_USAGE_PROMPT_TOKENS: AI_USAGE_PROMPT_TOKENS_ATTRIBUTE,
} as const;

/**
 * Attributes collected for `ai.streamText.doStream` span
 * @see https://ai-sdk.dev/docs/ai-sdk-core/telemetry#streamtext-function
 */
export const AI_STREAM_TEXT_DO_STREAM_SPAN_ATTRIBUTES = {
  OPERATION_NAME: OPERATION_NAME_ATTRIBUTE,
  AI_OPERATION_ID: AI_OPERATION_ID_ATTRIBUTE,
  AI_RESPONSE_MS_TO_FIRST_CHUNK: AI_RESPONSE_MS_TO_FIRST_CHUNK_ATTRIBUTE,
  AI_RESPONSE_MS_TO_FINISH: AI_RESPONSE_MS_TO_FINISH_ATTRIBUTE,
  AI_RESPONSE_AVG_COMPLETION_TOKENS_PER_SECOND: AI_RESPONSE_AVG_COMPLETION_TOKENS_PER_SECOND_ATTRIBUTE,
  // Basic LLM span information
  RESOURCE_NAME: RESOURCE_NAME_ATTRIBUTE,
  AI_MODEL_ID: AI_MODEL_ID_ATTRIBUTE,
  AI_MODEL_PROVIDER: AI_MODEL_PROVIDER_ATTRIBUTE,
  AI_REQUEST_HEADERS: AI_REQUEST_HEADERS_ATTRIBUTE,
  AI_SETTINGS_MAX_RETRIES: AI_SETTINGS_MAX_RETRIES_ATTRIBUTE,
  AI_TELEMETRY_FUNCTION_ID: AI_TELEMETRY_FUNCTION_ID_ATTRIBUTE,
  AI_TELEMETRY_METADATA: AI_TELEMETRY_METADATA_ATTRIBUTE,
  AI_USAGE_COMPLETION_TOKENS: AI_USAGE_COMPLETION_TOKENS_ATTRIBUTE,
  AI_USAGE_PROMPT_TOKENS: AI_USAGE_PROMPT_TOKENS_ATTRIBUTE,
  // Call LLM span information
  AI_RESPONSE_MODEL: AI_RESPONSE_MODEL_ATTRIBUTE,
  AI_RESPONSE_ID: AI_RESPONSE_ID_ATTRIBUTE,
  AI_RESPONSE_TIMESTAMP: AI_RESPONSE_TIMESTAMP_ATTRIBUTE,
  // Semantic Conventions for GenAI operations
  GEN_AI_SYSTEM: GEN_AI_SYSTEM_ATTRIBUTE,
  GEN_AI_REQUEST_MODEL: GEN_AI_REQUEST_MODEL_ATTRIBUTE,
  GEN_AI_REQUEST_TEMPERATURE: GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE,
  GEN_AI_REQUEST_MAX_TOKENS: GEN_AI_REQUEST_MAX_TOKENS_ATTRIBUTE,
  GEN_AI_REQUEST_FREQUENCY_PENALTY: GEN_AI_REQUEST_FREQUENCY_PENALTY_ATTRIBUTE,
  GEN_AI_REQUEST_PRESENCE_PENALTY: GEN_AI_REQUEST_PRESENCE_PENALTY_ATTRIBUTE,
  GEN_AI_REQUEST_TOP_K: GEN_AI_REQUEST_TOP_K_ATTRIBUTE,
  GEN_AI_REQUEST_TOP_P: GEN_AI_REQUEST_TOP_P_ATTRIBUTE,
  GEN_AI_REQUEST_STOP_SEQUENCES: GEN_AI_REQUEST_STOP_SEQUENCES_ATTRIBUTE,
  GEN_AI_RESPONSE_FINISH_REASONS: GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE,
  GEN_AI_RESPONSE_MODEL: GEN_AI_RESPONSE_MODEL_ATTRIBUTE,
  GEN_AI_RESPONSE_ID: GEN_AI_RESPONSE_ID_ATTRIBUTE,
  GEN_AI_USAGE_INPUT_TOKENS: GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_OUTPUT_TOKENS: GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE,
} as const;

/**
 * Attributes collected for `ai.generateObject` span
 * @see https://ai-sdk.dev/docs/ai-sdk-core/telemetry#generateobject-function
 */
export const AI_GENERATE_OBJECT_SPAN_ATTRIBUTES = {
  OPERATION_NAME: OPERATION_NAME_ATTRIBUTE,
  AI_OPERATION_ID: AI_OPERATION_ID_ATTRIBUTE,
  AI_SCHEMA: AI_SCHEMA_ATTRIBUTE,
  AI_SCHEMA_NAME: AI_SCHEMA_NAME_ATTRIBUTE,
  AI_SCHEMA_DESCRIPTION: AI_SCHEMA_DESCRIPTION_ATTRIBUTE,
  AI_RESPONSE_OBJECT: AI_RESPONSE_OBJECT_ATTRIBUTE,
  AI_SETTINGS_MODE: AI_SETTINGS_MODE_ATTRIBUTE,
  AI_SETTINGS_OUTPUT: AI_SETTINGS_OUTPUT_ATTRIBUTE,
  // Basic LLM span information
  RESOURCE_NAME: RESOURCE_NAME_ATTRIBUTE,
  AI_MODEL_ID: AI_MODEL_ID_ATTRIBUTE,
  AI_MODEL_PROVIDER: AI_MODEL_PROVIDER_ATTRIBUTE,
  AI_REQUEST_HEADERS: AI_REQUEST_HEADERS_ATTRIBUTE,
  AI_SETTINGS_MAX_RETRIES: AI_SETTINGS_MAX_RETRIES_ATTRIBUTE,
  AI_TELEMETRY_FUNCTION_ID: AI_TELEMETRY_FUNCTION_ID_ATTRIBUTE,
  AI_TELEMETRY_METADATA: AI_TELEMETRY_METADATA_ATTRIBUTE,
  AI_USAGE_COMPLETION_TOKENS: AI_USAGE_COMPLETION_TOKENS_ATTRIBUTE,
  AI_USAGE_PROMPT_TOKENS: AI_USAGE_PROMPT_TOKENS_ATTRIBUTE,
} as const;

/**
 * Attributes collected for `ai.streamObject` span
 * @see https://ai-sdk.dev/docs/ai-sdk-core/telemetry#streamobject-function
 */
export const AI_STREAM_OBJECT_SPAN_ATTRIBUTES = {
  OPERATION_NAME: OPERATION_NAME_ATTRIBUTE,
  AI_OPERATION_ID: AI_OPERATION_ID_ATTRIBUTE,
  AI_SCHEMA: AI_SCHEMA_ATTRIBUTE,
  AI_SCHEMA_NAME: AI_SCHEMA_NAME_ATTRIBUTE,
  AI_SCHEMA_DESCRIPTION: AI_SCHEMA_DESCRIPTION_ATTRIBUTE,
  AI_RESPONSE_OBJECT: AI_RESPONSE_OBJECT_ATTRIBUTE,
  AI_SETTINGS_MODE: AI_SETTINGS_MODE_ATTRIBUTE,
  AI_SETTINGS_OUTPUT: AI_SETTINGS_OUTPUT_ATTRIBUTE,
  // Basic LLM span information
  RESOURCE_NAME: RESOURCE_NAME_ATTRIBUTE,
  AI_MODEL_ID: AI_MODEL_ID_ATTRIBUTE,
  AI_MODEL_PROVIDER: AI_MODEL_PROVIDER_ATTRIBUTE,
  AI_REQUEST_HEADERS: AI_REQUEST_HEADERS_ATTRIBUTE,
  AI_SETTINGS_MAX_RETRIES: AI_SETTINGS_MAX_RETRIES_ATTRIBUTE,
  AI_TELEMETRY_FUNCTION_ID: AI_TELEMETRY_FUNCTION_ID_ATTRIBUTE,
  AI_TELEMETRY_METADATA: AI_TELEMETRY_METADATA_ATTRIBUTE,
  AI_USAGE_COMPLETION_TOKENS: AI_USAGE_COMPLETION_TOKENS_ATTRIBUTE,
  AI_USAGE_PROMPT_TOKENS: AI_USAGE_PROMPT_TOKENS_ATTRIBUTE,
} as const;

/**
 * Attributes collected for `ai.embed` span
 * @see https://ai-sdk.dev/docs/ai-sdk-core/telemetry#embed-function
 */
export const AI_EMBED_SPAN_ATTRIBUTES = {
  OPERATION_NAME: OPERATION_NAME_ATTRIBUTE,
  AI_OPERATION_ID: AI_OPERATION_ID_ATTRIBUTE,
  AI_VALUE: AI_VALUE_ATTRIBUTE,
  AI_EMBEDDING: AI_EMBEDDING_ATTRIBUTE,
  // Basic LLM span information
  RESOURCE_NAME: RESOURCE_NAME_ATTRIBUTE,
  AI_MODEL_ID: AI_MODEL_ID_ATTRIBUTE,
  AI_MODEL_PROVIDER: AI_MODEL_PROVIDER_ATTRIBUTE,
  AI_REQUEST_HEADERS: AI_REQUEST_HEADERS_ATTRIBUTE,
  AI_SETTINGS_MAX_RETRIES: AI_SETTINGS_MAX_RETRIES_ATTRIBUTE,
  AI_TELEMETRY_FUNCTION_ID: AI_TELEMETRY_FUNCTION_ID_ATTRIBUTE,
  AI_TELEMETRY_METADATA: AI_TELEMETRY_METADATA_ATTRIBUTE,
  // Basic embedding span information
  AI_USAGE_TOKENS: AI_USAGE_TOKENS_ATTRIBUTE,
} as const;

/**
 * Attributes collected for `ai.embed.doEmbed` span
 * @see https://ai-sdk.dev/docs/ai-sdk-core/telemetry#embed-function
 */
export const AI_EMBED_DO_EMBED_SPAN_ATTRIBUTES = {
  OPERATION_NAME: OPERATION_NAME_ATTRIBUTE,
  AI_OPERATION_ID: AI_OPERATION_ID_ATTRIBUTE,
  AI_VALUES: AI_VALUES_ATTRIBUTE,
  AI_EMBEDDINGS: AI_EMBEDDINGS_ATTRIBUTE,
  // Basic LLM span information
  RESOURCE_NAME: RESOURCE_NAME_ATTRIBUTE,
  AI_MODEL_ID: AI_MODEL_ID_ATTRIBUTE,
  AI_MODEL_PROVIDER: AI_MODEL_PROVIDER_ATTRIBUTE,
  AI_REQUEST_HEADERS: AI_REQUEST_HEADERS_ATTRIBUTE,
  AI_SETTINGS_MAX_RETRIES: AI_SETTINGS_MAX_RETRIES_ATTRIBUTE,
  AI_TELEMETRY_FUNCTION_ID: AI_TELEMETRY_FUNCTION_ID_ATTRIBUTE,
  AI_TELEMETRY_METADATA: AI_TELEMETRY_METADATA_ATTRIBUTE,
  // Basic embedding span information
  AI_USAGE_TOKENS: AI_USAGE_TOKENS_ATTRIBUTE,
} as const;

/**
 * Attributes collected for `ai.embedMany` span
 * @see https://ai-sdk.dev/docs/ai-sdk-core/telemetry#embedmany-function
 */
export const AI_EMBED_MANY_SPAN_ATTRIBUTES = {
  OPERATION_NAME: OPERATION_NAME_ATTRIBUTE,
  AI_OPERATION_ID: AI_OPERATION_ID_ATTRIBUTE,
  AI_VALUES: AI_VALUES_ATTRIBUTE,
  AI_EMBEDDINGS: AI_EMBEDDINGS_ATTRIBUTE,
  // Basic LLM span information
  RESOURCE_NAME: RESOURCE_NAME_ATTRIBUTE,
  AI_MODEL_ID: AI_MODEL_ID_ATTRIBUTE,
  AI_MODEL_PROVIDER: AI_MODEL_PROVIDER_ATTRIBUTE,
  AI_REQUEST_HEADERS: AI_REQUEST_HEADERS_ATTRIBUTE,
  AI_SETTINGS_MAX_RETRIES: AI_SETTINGS_MAX_RETRIES_ATTRIBUTE,
  AI_TELEMETRY_FUNCTION_ID: AI_TELEMETRY_FUNCTION_ID_ATTRIBUTE,
  AI_TELEMETRY_METADATA: AI_TELEMETRY_METADATA_ATTRIBUTE,
  // Basic embedding span information
  AI_USAGE_TOKENS: AI_USAGE_TOKENS_ATTRIBUTE,
} as const;

/**
 * Attributes collected for `ai.toolCall` span
 * @see https://ai-sdk.dev/docs/ai-sdk-core/telemetry#tool-call-spans
 */
export const AI_TOOL_CALL_SPAN_ATTRIBUTES = {
  OPERATION_NAME: OPERATION_NAME_ATTRIBUTE,
  AI_OPERATION_ID: AI_OPERATION_ID_ATTRIBUTE,
  AI_TOOL_CALL_NAME: AI_TOOL_CALL_NAME_ATTRIBUTE,
  AI_TOOL_CALL_ID: AI_TOOL_CALL_ID_ATTRIBUTE,
  AI_TOOL_CALL_ARGS: AI_TOOL_CALL_ARGS_ATTRIBUTE,
  AI_TOOL_CALL_RESULT: AI_TOOL_CALL_RESULT_ATTRIBUTE,
  // Basic LLM span information
  RESOURCE_NAME: RESOURCE_NAME_ATTRIBUTE,
  AI_MODEL_ID: AI_MODEL_ID_ATTRIBUTE,
  AI_MODEL_PROVIDER: AI_MODEL_PROVIDER_ATTRIBUTE,
  AI_REQUEST_HEADERS: AI_REQUEST_HEADERS_ATTRIBUTE,
  AI_SETTINGS_MAX_RETRIES: AI_SETTINGS_MAX_RETRIES_ATTRIBUTE,
  AI_TELEMETRY_FUNCTION_ID: AI_TELEMETRY_FUNCTION_ID_ATTRIBUTE,
  AI_TELEMETRY_METADATA: AI_TELEMETRY_METADATA_ATTRIBUTE,
} as const;
