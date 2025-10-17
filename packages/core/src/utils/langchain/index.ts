import { captureException } from '../../exports';
import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '../../semanticAttributes';
import { SPAN_STATUS_ERROR } from '../../tracing';
import { startSpanManual } from '../../tracing/trace';
import type { Span, SpanAttributeValue } from '../../types-hoist/span';
import { GEN_AI_OPERATION_NAME_ATTRIBUTE, GEN_AI_REQUEST_MODEL_ATTRIBUTE } from '../ai/gen-ai-attributes';
import { LANGCHAIN_ORIGIN } from './constants';
import type { LangChainLLMResult, LangChainMessage, LangChainOptions, LangChainSerializedLLM } from './types';
import {
  extractChatModelRequestAttributes,
  extractLLMRequestAttributes,
  extractLlmResponseAttributes,
  getInvocationParams,
} from './utils';

/**
 * Creates a Sentry callback handler for LangChain
 * Returns a plain object that LangChain will call via duck-typing
 *
 * This is a stateful handler that tracks spans across multiple LangChain executions.
 */
export function createLangChainCallbackHandler(options: LangChainOptions = {}): {
  handleLLMStart?: (
    llm: LangChainSerializedLLM,
    prompts: string[],
    runId: string,
    parentRunId?: string,
    extraParams?: Record<string, unknown>,
    tags?: string[] | Record<string, unknown>,
    metadata?: Record<string, unknown>,
    runName?: string | Record<string, unknown>,
  ) => void;
  handleChatModelStart?: (
    llm: LangChainSerializedLLM,
    messages: LangChainMessage[][],
    runId: string,
    parentRunId?: string,
    extraParams?: Record<string, unknown>,
    tags?: string[] | Record<string, unknown>,
    metadata?: Record<string, unknown>,
    runName?: string | Record<string, unknown>,
  ) => void;
  handleLLMNewToken?: (token: string, runId: string) => void;
  handleLLMEnd?: (output: LangChainLLMResult, runId: string) => void;
  handleLLMError?: (error: Error, runId: string) => void;
  handleChainStart?: (
    chain: { name?: string },
    inputs: Record<string, unknown>,
    runId: string,
    parentRunId?: string,
  ) => void;
  handleChainEnd?: (outputs: Record<string, unknown>, runId: string) => void;
  handleChainError?: (error: Error, runId: string) => void;
  handleToolStart?: (tool: { name?: string }, input: string, runId: string, parentRunId?: string) => void;
  handleToolEnd?: (output: string, runId: string) => void;
  handleToolError?: (error: Error, runId: string) => void;
} {
  const recordInputs = options.recordInputs ?? false;
  const recordOutputs = options.recordOutputs ?? false;

  // Internal state - single instance tracks all spans
  const spanMap = new Map<string, Span>();

  /**
   * Exit a span and clean up
   */
  const exitSpan = (runId: string): void => {
    const span = spanMap.get(runId);
    if (span) {
      span.end();
      spanMap.delete(runId);
    }
  };

  /**
   * Handler for LLM Start
   * This handler will be called by LangChain's callback handler when an LLM event is detected.
   */
  const handler = {
    handleLLMStart(
      llm: LangChainSerializedLLM,
      prompts: string[],
      runId: string,
      _parentRunId?: string,
      _extraParams?: Record<string, unknown>,
      tags?: string[] | Record<string, unknown>,
      metadata?: Record<string, unknown>,
      _runName?: string | Record<string, unknown>,
    ) {
      try {
        const invocationParams = getInvocationParams(tags);
        const attributes = extractLLMRequestAttributes(llm, prompts, recordInputs, invocationParams, metadata);
        const modelName = attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE];
        const operationName = attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE];

        startSpanManual(
          {
            name: `${operationName} ${modelName}`,
            op: 'gen_ai.pipeline',
            attributes: {
              ...attributes,
              [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.pipeline',
            },
          },
          span => {
            spanMap.set(runId, span);
            return span;
          },
        );
      } catch {
        // Silently ignore errors, llm errors are captured by the handleLLMError handler
      }
    },

    // Chat Model Start Handler
    handleChatModelStart(
      llm: LangChainSerializedLLM,
      messages: LangChainMessage[][],
      runId: string,
      _parentRunId?: string,
      _extraParams?: Record<string, unknown>,
      tags?: string[] | Record<string, unknown>,
      metadata?: Record<string, unknown>,
      _runName?: string | Record<string, unknown>,
    ) {
      try {
        const invocationParams = getInvocationParams(tags);
        const attributes = extractChatModelRequestAttributes(llm, messages, recordInputs, invocationParams, metadata);
        const modelName = attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE];
        const operationName = attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE];

        startSpanManual(
          {
            name: `${operationName} ${modelName}`,
            op: 'gen_ai.chat',
            attributes: {
              ...attributes,
              [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.chat',
            },
          },
          span => {
            spanMap.set(runId, span);

            return span;
          },
        );
      } catch {
        // Silently ignore errors, chat model start errors are captured by the handleChatModelError handler
      }
    },

    // LLM End Handler - note: handleLLMEnd with capital LLM (used by both LLMs and chat models!)
    handleLLMEnd(
      output: LangChainLLMResult,
      runId: string,
      _parentRunId?: string,
      _tags?: string[],
      _extraParams?: Record<string, unknown>,
    ) {
      try {
        const span = spanMap.get(runId);
        if (span) {
          const attributes = extractLlmResponseAttributes(output, recordOutputs);
          if (attributes) {
            span.setAttributes(attributes);
          }
          exitSpan(runId);
        }
      } catch {
        // Silently ignore errors, llm end errors are captured by the handleLLMError handler
      }
    },

    // LLM Error Handler - note: handleLLMError with capital LLM
    handleLLMError(error: Error, runId: string) {
      try {
        const span = spanMap.get(runId);
        if (span) {
          span.setStatus({ code: SPAN_STATUS_ERROR, message: 'llm_error' });
          exitSpan(runId);
        }

        captureException(error, {
          mechanism: {
            handled: false,
            type: LANGCHAIN_ORIGIN,
            data: { handler: 'handleLLMError' },
          },
        });
      } catch {
        // silently ignore errors
      }
    },

    // Chain Start Handler
    handleChainStart(chain: { name?: string }, inputs: Record<string, unknown>, runId: string, _parentRunId?: string) {
      try {
        const chainName = chain.name || 'unknown_chain';
        const attributes: Record<string, SpanAttributeValue> = {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.langchain',
          'langchain.chain.name': chainName,
        };

        // Add inputs if recordInputs is enabled
        if (recordInputs) {
          attributes['langchain.chain.inputs'] = JSON.stringify(inputs);
        }

        startSpanManual(
          {
            name: `chain ${chainName}`,
            op: 'gen_ai.invoke_agent',
            attributes: {
              ...attributes,
              [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.invoke_agent',
            },
          },
          span => {
            spanMap.set(runId, span);

            return span;
          },
        );
      } catch {
        // Silently ignore errors, chain start errors are captured by the handleChainError handler
      }
    },

    // Chain End Handler
    handleChainEnd(outputs: Record<string, unknown>, runId: string) {
      try {
        const span = spanMap.get(runId);
        if (span) {
          // Add outputs if recordOutputs is enabled
          if (recordOutputs) {
            span.setAttributes({
              'langchain.chain.outputs': JSON.stringify(outputs),
            });
          }
          exitSpan(runId);
        }
      } catch {
        // Silently ignore errors, chain end errors are captured by the handleChainError handler
      }
    },

    // Chain Error Handler
    handleChainError(error: Error, runId: string) {
      try {
        const span = spanMap.get(runId);
        if (span) {
          span.setStatus({ code: SPAN_STATUS_ERROR, message: 'chain_error' });
          exitSpan(runId);
        }

        captureException(error, {
          mechanism: {
            handled: false,
            type: LANGCHAIN_ORIGIN,
          },
        });
      } catch {
        // silently ignore errors
      }
    },

    // Tool Start Handler
    handleToolStart(tool: { name?: string }, input: string, runId: string, _parentRunId?: string) {
      try {
        const toolName = tool.name || 'unknown_tool';
        const attributes: Record<string, SpanAttributeValue> = {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: LANGCHAIN_ORIGIN,
          'gen_ai.tool.name': toolName,
        };

        // Add input if recordInputs is enabled
        if (recordInputs) {
          attributes['gen_ai.tool.input'] = input;
        }

        startSpanManual(
          {
            name: `execute_tool ${toolName}`,
            op: 'gen_ai.execute_tool',
            attributes: {
              ...attributes,
              [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.execute_tool',
            },
          },
          span => {
            spanMap.set(runId, span);
            return span;
          },
        );
      } catch {
        // Silently ignore errors, tool start errors are captured by the handleToolError handler
      }
    },

    // Tool End Handler
    handleToolEnd(output: string, runId: string) {
      try {
        const span = spanMap.get(runId);
        if (span) {
          // Add output if recordOutputs is enabled
          if (recordOutputs) {
            span.setAttributes({
              'gen_ai.tool.output': output,
            });
          }
          exitSpan(runId);
        }
      } catch {
        // Silently ignore errors, tool start errors are captured by the handleToolError handler
      }
    },

    // Tool Error Handler
    handleToolError(error: Error, runId: string) {
      try {
        const span = spanMap.get(runId);
        if (span) {
          span.setStatus({ code: SPAN_STATUS_ERROR, message: 'tool_error' });
          exitSpan(runId);
        }

        captureException(error, {
          mechanism: {
            handled: false,
            type: LANGCHAIN_ORIGIN,
          },
        });
      } catch {
        // silently ignore errors
      }
    },
  };

  return handler;
}
