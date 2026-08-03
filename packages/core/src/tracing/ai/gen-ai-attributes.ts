/**
 * Gen-AI telemetry attributes that are not (yet) covered by `@sentry/conventions`.
 *
 * Attributes with an equivalent in `@sentry/conventions/attributes` are imported from there directly
 * at their call sites. The constants below either have no conventions equivalent, are Sentry-internal
 * meta attributes, are span-operation values (not attribute keys), or intentionally emit a different
 * key than the current conventions attribute.
 *
 * Based on OpenTelemetry Semantic Conventions for Generative AI
 * @see https://opentelemetry.io/docs/specs/semconv/gen-ai/
 */

/**
 * Whether streaming was enabled for the request
 */
export const GEN_AI_REQUEST_STREAM_ATTRIBUTE = 'gen_ai.request.stream';

/**
 * The encoding format for the model request
 */
export const GEN_AI_REQUEST_ENCODING_FORMAT_ATTRIBUTE = 'gen_ai.request.encoding_format';

/**
 * The dimensions for the model request
 */
export const GEN_AI_REQUEST_DIMENSIONS_ATTRIBUTE = 'gen_ai.request.dimensions';

/**
 * The reason why the model stopped generating tokens
 */
export const GEN_AI_RESPONSE_STOP_REASON_ATTRIBUTE = 'gen_ai.response.stop_reason';

/**
 * The span operation name for invoking an agent
 */
export const GEN_AI_INVOKE_AGENT_OPERATION_ATTRIBUTE = 'gen_ai.invoke_agent';

/**
 * The span operation for embeddings
 */
export const GEN_AI_EMBEDDINGS_OPERATION_ATTRIBUTE = 'gen_ai.embeddings';

/**
 * The span operation name for executing a tool
 */
export const GEN_AI_EXECUTE_TOOL_OPERATION_ATTRIBUTE = 'gen_ai.execute_tool';

/**
 * The tool call ID
 */
export const GEN_AI_TOOL_CALL_ID_ATTRIBUTE = 'gen_ai.tool.call.id';
