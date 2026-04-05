import { describe, expect, it } from 'vitest';
import { getSpanOpFromName } from '../../../src/tracing/vercel-ai/utils';

describe('vercel-ai rerank support', () => {
  describe('getSpanOpFromName', () => {
    it('should not assign a gen_ai op to ai.rerank pipeline span', () => {
      expect(getSpanOpFromName('ai.rerank')).toBeUndefined();
    });

    it('should map ai.rerank.doRerank to gen_ai.rerank', () => {
      expect(getSpanOpFromName('ai.rerank.doRerank')).toBe('gen_ai.rerank');
    });
  });
});
