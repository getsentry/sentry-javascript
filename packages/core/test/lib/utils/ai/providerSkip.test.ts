import { beforeEach, describe, expect, it } from 'vitest';
import {
  _INTERNAL_clearAiProviderSkips,
  _INTERNAL_shouldSkipAiProviderWrapping,
  _INTERNAL_skipAiProviderWrapping,
  ANTHROPIC_AI_INTEGRATION_NAME,
  GOOGLE_GENAI_INTEGRATION_NAME,
  OPENAI_INTEGRATION_NAME,
} from '../../../../src/index';

describe('AI Provider Skip', () => {
  beforeEach(() => {
    _INTERNAL_clearAiProviderSkips();
  });

  describe('_INTERNAL_skipAiProviderWrapping', () => {
    it('marks a single provider to be skipped', () => {
      _INTERNAL_skipAiProviderWrapping([OPENAI_INTEGRATION_NAME]);
      expect(_INTERNAL_shouldSkipAiProviderWrapping(OPENAI_INTEGRATION_NAME)).toBe(true);
      expect(_INTERNAL_shouldSkipAiProviderWrapping(ANTHROPIC_AI_INTEGRATION_NAME)).toBe(false);
    });

    it('marks multiple providers to be skipped', () => {
      _INTERNAL_skipAiProviderWrapping([OPENAI_INTEGRATION_NAME, ANTHROPIC_AI_INTEGRATION_NAME]);
      expect(_INTERNAL_shouldSkipAiProviderWrapping(OPENAI_INTEGRATION_NAME)).toBe(true);
      expect(_INTERNAL_shouldSkipAiProviderWrapping(ANTHROPIC_AI_INTEGRATION_NAME)).toBe(true);
      expect(_INTERNAL_shouldSkipAiProviderWrapping(GOOGLE_GENAI_INTEGRATION_NAME)).toBe(false);
    });

    it('is idempotent - can mark same provider multiple times', () => {
      _INTERNAL_skipAiProviderWrapping([OPENAI_INTEGRATION_NAME]);
      _INTERNAL_skipAiProviderWrapping([OPENAI_INTEGRATION_NAME]);
      _INTERNAL_skipAiProviderWrapping([OPENAI_INTEGRATION_NAME]);
      expect(_INTERNAL_shouldSkipAiProviderWrapping(OPENAI_INTEGRATION_NAME)).toBe(true);
    });
  });

  describe('_INTERNAL_shouldSkipAiProviderWrapping', () => {
    it('returns false for unmarked providers', () => {
      expect(_INTERNAL_shouldSkipAiProviderWrapping(OPENAI_INTEGRATION_NAME)).toBe(false);
      expect(_INTERNAL_shouldSkipAiProviderWrapping(ANTHROPIC_AI_INTEGRATION_NAME)).toBe(false);
      expect(_INTERNAL_shouldSkipAiProviderWrapping(GOOGLE_GENAI_INTEGRATION_NAME)).toBe(false);
    });

    it('returns true after marking provider to be skipped', () => {
      _INTERNAL_skipAiProviderWrapping([ANTHROPIC_AI_INTEGRATION_NAME]);
      expect(_INTERNAL_shouldSkipAiProviderWrapping(ANTHROPIC_AI_INTEGRATION_NAME)).toBe(true);
    });
  });

  describe('_INTERNAL_clearAiProviderSkips', () => {
    it('clears all skip registrations', () => {
      _INTERNAL_skipAiProviderWrapping([OPENAI_INTEGRATION_NAME, ANTHROPIC_AI_INTEGRATION_NAME]);
      expect(_INTERNAL_shouldSkipAiProviderWrapping(OPENAI_INTEGRATION_NAME)).toBe(true);
      expect(_INTERNAL_shouldSkipAiProviderWrapping(ANTHROPIC_AI_INTEGRATION_NAME)).toBe(true);

      _INTERNAL_clearAiProviderSkips();

      expect(_INTERNAL_shouldSkipAiProviderWrapping(OPENAI_INTEGRATION_NAME)).toBe(false);
      expect(_INTERNAL_shouldSkipAiProviderWrapping(ANTHROPIC_AI_INTEGRATION_NAME)).toBe(false);
    });

    it('can be called multiple times safely', () => {
      _INTERNAL_skipAiProviderWrapping([OPENAI_INTEGRATION_NAME]);
      _INTERNAL_clearAiProviderSkips();
      _INTERNAL_clearAiProviderSkips();
      _INTERNAL_clearAiProviderSkips();
      expect(_INTERNAL_shouldSkipAiProviderWrapping(OPENAI_INTEGRATION_NAME)).toBe(false);
    });
  });
});
