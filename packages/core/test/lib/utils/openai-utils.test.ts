import { describe, expect, it, vi } from 'vitest';
import {
  addResponsesApiAttributes,
  buildMethodPath,
  extractRequestParameters,
  getOperationName,
  getSpanOperation,
  isChatCompletionChunk,
  isChatCompletionResponse,
  isConversationResponse,
  isResponsesApiResponse,
  isResponsesApiStreamEvent,
  shouldInstrument,
} from '../../../src/tracing/openai/utils';
import type { OpenAIResponseObject } from '../../../src/tracing/openai/types';

describe('openai-utils', () => {
  describe('getOperationName', () => {
    it('should return chat for chat.completions methods', () => {
      expect(getOperationName('chat.completions.create')).toBe('chat');
      expect(getOperationName('some.path.chat.completions.method')).toBe('chat');
    });

    it('should return chat for responses methods', () => {
      expect(getOperationName('responses.create')).toBe('chat');
      expect(getOperationName('some.path.responses.method')).toBe('chat');
    });

    it('should return chat for conversations methods', () => {
      expect(getOperationName('conversations.create')).toBe('chat');
      expect(getOperationName('some.path.conversations.method')).toBe('chat');
    });

    it('should return the last part of path for unknown methods', () => {
      expect(getOperationName('some.unknown.method')).toBe('method');
      expect(getOperationName('create')).toBe('create');
    });

    it('should return unknown for empty path', () => {
      expect(getOperationName('')).toBe('unknown');
    });
  });

  describe('getSpanOperation', () => {
    it('should prefix operation with gen_ai', () => {
      expect(getSpanOperation('chat.completions.create')).toBe('gen_ai.chat');
      expect(getSpanOperation('responses.create')).toBe('gen_ai.chat');
      expect(getSpanOperation('some.custom.operation')).toBe('gen_ai.operation');
    });
  });

  describe('shouldInstrument', () => {
    it('should return true for instrumented methods', () => {
      expect(shouldInstrument('responses.create')).toBe(true);
      expect(shouldInstrument('chat.completions.create')).toBe(true);
      expect(shouldInstrument('conversations.create')).toBe(true);
    });

    it('should return false for non-instrumented methods', () => {
      expect(shouldInstrument('unknown.method')).toBe(false);
      expect(shouldInstrument('')).toBe(false);
    });
  });

  describe('buildMethodPath', () => {
    it('should build method path correctly', () => {
      expect(buildMethodPath('', 'chat')).toBe('chat');
      expect(buildMethodPath('chat', 'completions')).toBe('chat.completions');
      expect(buildMethodPath('chat.completions', 'create')).toBe('chat.completions.create');
    });
  });

  describe('extractRequestParameters', () => {
    it('should include the request model when it is explicitly provided', () => {
      expect(
        extractRequestParameters({
          model: 'gpt-4.1-mini',
          temperature: 0.2,
        }),
      ).toEqual({
        'gen_ai.request.model': 'gpt-4.1-mini',
        'gen_ai.request.temperature': 0.2,
      });
    });

    it('should default the request model to unknown when it is not provided', () => {
      expect(
        extractRequestParameters({
          temperature: 0.2,
        }),
      ).toEqual({
        'gen_ai.request.model': 'unknown',
        'gen_ai.request.temperature': 0.2,
      });
    });
  });

  describe('isChatCompletionResponse', () => {
    it('should return true for valid chat completion responses', () => {
      const validResponse = {
        object: 'chat.completion',
        id: 'chatcmpl-123',
        model: 'gpt-4',
        choices: [],
      };
      expect(isChatCompletionResponse(validResponse)).toBe(true);
    });

    it('should return false for invalid responses', () => {
      expect(isChatCompletionResponse(null)).toBe(false);
      expect(isChatCompletionResponse(undefined)).toBe(false);
      expect(isChatCompletionResponse('string')).toBe(false);
      expect(isChatCompletionResponse(123)).toBe(false);
      expect(isChatCompletionResponse({})).toBe(false);
      expect(isChatCompletionResponse({ object: 'different' })).toBe(false);
      expect(isChatCompletionResponse({ object: null })).toBe(false);
    });
  });

  describe('isResponsesApiResponse', () => {
    it('should return true for valid responses API responses', () => {
      const validResponse = {
        object: 'response',
        id: 'resp_123',
        model: 'gpt-4',
        choices: [],
      };
      expect(isResponsesApiResponse(validResponse)).toBe(true);
    });

    it('should return false for invalid responses', () => {
      expect(isResponsesApiResponse(null)).toBe(false);
      expect(isResponsesApiResponse(undefined)).toBe(false);
      expect(isResponsesApiResponse('string')).toBe(false);
      expect(isResponsesApiResponse(123)).toBe(false);
      expect(isResponsesApiResponse({})).toBe(false);
      expect(isResponsesApiResponse({ object: 'different' })).toBe(false);
      expect(isResponsesApiResponse({ object: null })).toBe(false);
    });
  });

  describe('isResponsesApiStreamEvent', () => {
    it('should return true for valid responses API stream events', () => {
      expect(isResponsesApiStreamEvent({ type: 'response.created' })).toBe(true);
      expect(isResponsesApiStreamEvent({ type: 'response.in_progress' })).toBe(true);
      expect(isResponsesApiStreamEvent({ type: 'response.completed' })).toBe(true);
      expect(isResponsesApiStreamEvent({ type: 'response.failed' })).toBe(true);
      expect(isResponsesApiStreamEvent({ type: 'response.output_text.delta' })).toBe(true);
    });

    it('should return false for non-response events', () => {
      expect(isResponsesApiStreamEvent(null)).toBe(false);
      expect(isResponsesApiStreamEvent(undefined)).toBe(false);
      expect(isResponsesApiStreamEvent('string')).toBe(false);
      expect(isResponsesApiStreamEvent(123)).toBe(false);
      expect(isResponsesApiStreamEvent({})).toBe(false);
      expect(isResponsesApiStreamEvent({ type: 'chat.completion' })).toBe(false);
      expect(isResponsesApiStreamEvent({ type: null })).toBe(false);
      expect(isResponsesApiStreamEvent({ type: 123 })).toBe(false);
    });
  });

  describe('isChatCompletionChunk', () => {
    it('should return true for valid chat completion chunks', () => {
      const validChunk = {
        object: 'chat.completion.chunk',
        id: 'chatcmpl-123',
        model: 'gpt-4',
        choices: [],
      };
      expect(isChatCompletionChunk(validChunk)).toBe(true);
    });

    it('should return false for invalid chunks', () => {
      expect(isChatCompletionChunk(null)).toBe(false);
      expect(isChatCompletionChunk(undefined)).toBe(false);
      expect(isChatCompletionChunk('string')).toBe(false);
      expect(isChatCompletionChunk(123)).toBe(false);
      expect(isChatCompletionChunk({})).toBe(false);
      expect(isChatCompletionChunk({ object: 'chat.completion' })).toBe(false);
      expect(isChatCompletionChunk({ object: null })).toBe(false);
    });
  });

  describe('isConversationResponse', () => {
    it('should return true for valid conversation responses', () => {
      const validConversation = {
        object: 'conversation',
        id: 'conv_689667905b048191b4740501625afd940c7533ace33a2dab',
        created_at: 1704067200,
      };
      expect(isConversationResponse(validConversation)).toBe(true);
    });

    it('should return true for conversation with metadata', () => {
      const conversationWithMetadata = {
        object: 'conversation',
        id: 'conv_123',
        created_at: 1704067200,
        metadata: { user_id: 'user_123' },
      };
      expect(isConversationResponse(conversationWithMetadata)).toBe(true);
    });

    it('should return false for invalid responses', () => {
      expect(isConversationResponse(null)).toBe(false);
      expect(isConversationResponse(undefined)).toBe(false);
      expect(isConversationResponse('string')).toBe(false);
      expect(isConversationResponse(123)).toBe(false);
      expect(isConversationResponse({})).toBe(false);
      expect(isConversationResponse({ object: 'thread' })).toBe(false);
      expect(isConversationResponse({ object: 'response' })).toBe(false);
      expect(isConversationResponse({ object: null })).toBe(false);
    });
  });

  describe('addResponsesApiAttributes', () => {
    it('should backfill the request model and span name from the response model', () => {
      const span = {
        setAttributes: vi.fn(),
        updateName: vi.fn(),
      };

      addResponsesApiAttributes(
        span as unknown as Parameters<typeof addResponsesApiAttributes>[0],
        {
          object: 'response',
          id: 'resp_123',
          model: 'gpt-4.1-mini',
          created_at: 1704067200,
          status: 'completed',
        } as unknown as OpenAIResponseObject,
        false,
      );

      expect(span.setAttributes).toHaveBeenCalledWith({
        'gen_ai.request.model': 'gpt-4.1-mini',
      });
      expect(span.updateName).toHaveBeenCalledWith('chat gpt-4.1-mini');
    });
  });
});
