import { describe, expect, it } from 'vitest';
import { buildMethodPath } from '../../../src/tracing/ai/utils';
import { isChatCompletionChunk, isResponsesApiStreamEvent } from '../../../src/tracing/openai/utils';

describe('openai-utils', () => {
  describe('buildMethodPath', () => {
    it('should build method path correctly', () => {
      expect(buildMethodPath('', 'chat')).toBe('chat');
      expect(buildMethodPath('chat', 'completions')).toBe('chat.completions');
      expect(buildMethodPath('chat.completions', 'create')).toBe('chat.completions.create');
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
});
