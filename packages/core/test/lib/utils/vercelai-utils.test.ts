import { describe, expect, it } from 'vitest';
import { convertUserInputToMessagesFormat } from '../../../src/tracing/vercel-ai/utils';

describe('vercel-ai-utils', () => {
  describe('convertUserInputToMessagesFormat', () => {
    it('should convert a prompt with system to a messages array', () => {
      expect(
        convertUserInputToMessagesFormat(
          JSON.stringify({
            system: 'You are a friendly robot',
            prompt: 'Hello, robot',
          }),
        ),
      ).toStrictEqual([
        { role: 'system', content: 'You are a friendly robot' },
        { role: 'user', content: 'Hello, robot' },
      ]);
    });

    it('should convert a system prompt to a messages array', () => {
      expect(
        convertUserInputToMessagesFormat(
          JSON.stringify({
            system: 'You are a friendly robot',
          }),
        ),
      ).toStrictEqual([{ role: 'system', content: 'You are a friendly robot' }]);
    });

    it('should convert a user only prompt to a messages array', () => {
      expect(
        convertUserInputToMessagesFormat(
          JSON.stringify({
            prompt: 'Hello, robot',
          }),
        ),
      ).toStrictEqual([{ role: 'user', content: 'Hello, robot' }]);
    });

    it('should convert a messages array with multiple messages', () => {
      expect(
        convertUserInputToMessagesFormat(
          JSON.stringify({
            messages: [
              { role: 'user', content: 'What is the weather?' },
              { role: 'assistant', content: "I'll check." },
              { role: 'user', content: 'Also New York?' },
            ],
          }),
        ),
      ).toStrictEqual([
        { role: 'user', content: 'What is the weather?' },
        { role: 'assistant', content: "I'll check." },
        { role: 'user', content: 'Also New York?' },
      ]);
    });

    it('should convert a messages array with a single message', () => {
      expect(
        convertUserInputToMessagesFormat(
          JSON.stringify({
            messages: [{ role: 'user', content: 'Hello' }],
          }),
        ),
      ).toStrictEqual([{ role: 'user', content: 'Hello' }]);
    });

    it('should filter out invalid entries in messages array', () => {
      expect(
        convertUserInputToMessagesFormat(
          JSON.stringify({
            messages: [
              { role: 'user', content: 'Hello' },
              'not an object',
              null,
              { role: 'user' },
              { content: 'missing role' },
              { role: 'assistant', content: 'Valid' },
            ],
          }),
        ),
      ).toStrictEqual([
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Valid' },
      ]);
    });

    it('should ignore unexpected data', () => {
      expect(
        convertUserInputToMessagesFormat(
          JSON.stringify({
            randomField: 'Hello, robot',
            nothing: 'that we know how to handle',
          }),
        ),
      ).toStrictEqual([]);
    });

    it('should prepend system instruction to messages array', () => {
      expect(
        convertUserInputToMessagesFormat(
          JSON.stringify({
            system: 'You are a friendly robot',
            messages: [
              { role: 'user', content: 'Hello' },
              { role: 'assistant', content: 'Hi there!' },
            ],
          }),
        ),
      ).toStrictEqual([
        { role: 'system', content: 'You are a friendly robot' },
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ]);
    });

    it('should handle double-encoded messages array', () => {
      expect(
        convertUserInputToMessagesFormat(
          JSON.stringify({
            messages: JSON.stringify([
              { role: 'user', content: 'Hello' },
              { role: 'assistant', content: 'Hi there!' },
            ]),
          }),
        ),
      ).toStrictEqual([
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ]);
    });

    it('should not break on invalid json', () => {
      expect(convertUserInputToMessagesFormat('this is not json')).toStrictEqual([]);
    });

    it('should convert a prompt array to a messages array', () => {
      expect(
        convertUserInputToMessagesFormat(
          JSON.stringify({
            prompt: [
              { role: 'user', content: 'Hello' },
              { role: 'assistant', content: 'Hi there!' },
            ],
          }),
        ),
      ).toStrictEqual([
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ]);
    });

    it('should prepend system instruction to prompt array', () => {
      expect(
        convertUserInputToMessagesFormat(
          JSON.stringify({
            system: 'You are a friendly robot',
            prompt: [
              { role: 'user', content: 'Hello' },
              { role: 'assistant', content: 'Hi there!' },
            ],
          }),
        ),
      ).toStrictEqual([
        { role: 'system', content: 'You are a friendly robot' },
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ]);
    });

    it('should filter out invalid entries in prompt array', () => {
      expect(
        convertUserInputToMessagesFormat(
          JSON.stringify({
            prompt: [
              { role: 'user', content: 'Hello' },
              'not an object',
              null,
              { role: 'user' },
              { content: 'missing role' },
              { role: 'assistant', content: 'Valid' },
            ],
          }),
        ),
      ).toStrictEqual([
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Valid' },
      ]);
    });
  });
});
