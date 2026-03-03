import { describe, expect, it } from 'vitest';
import { getSpanOpFromName } from '../../../src/tracing/vercel-ai/utils';

describe('vercel-ai rerank support', () => {
  describe('getSpanOpFromName', () => {
    it('should map ai.rerank to gen_ai.invoke_agent', () => {
      expect(getSpanOpFromName('ai.rerank')).toBe('gen_ai.invoke_agent');
    });

    it('should map ai.rerank.doRerank to gen_ai.rerank', () => {
      expect(getSpanOpFromName('ai.rerank.doRerank')).toBe('gen_ai.rerank');
    });
  });
});
