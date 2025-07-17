import { describe, expect, it } from 'vitest';
import {
  buildMethodPath,
  getOperationName,
  getSpanOperation,
  isChatCompletionResponse,
  isResponsesApiResponse,
  shouldInstrument,
} from '../../../src/utils/openai/utils';

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
});
