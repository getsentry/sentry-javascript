import { describe, expect, it } from 'vitest';
import { SPAN_TO_OPERATION_NAME } from '../../../src/tracing/vercel-ai/constants';

describe('vercel-ai rerank support', () => {
  describe('SPAN_TO_OPERATION_NAME', () => {
    it('should not have a mapping for ai.rerank pipeline span', () => {
      expect(SPAN_TO_OPERATION_NAME.get('ai.rerank')).toBeUndefined();
    });

    it('should map ai.rerank.doRerank to rerank', () => {
      expect(SPAN_TO_OPERATION_NAME.get('ai.rerank.doRerank')).toBe('rerank');
    });
  });
});
