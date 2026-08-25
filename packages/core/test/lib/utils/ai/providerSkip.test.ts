import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Scope } from '../../../../src/index';
import {
  _INTERNAL_clearAiProviderSkips,
  _INTERNAL_shouldSkipAiProviderWrapping,
  _INTERNAL_skipAiProviderWrapping,
  getAsyncContextStrategy,
  getDefaultIsolationScope,
  getMainCarrier,
  setAsyncContextStrategy,
} from '../../../../src/index';

const OPENAI_INTEGRATION_NAME = 'OpenAI';
const ANTHROPIC_AI_INTEGRATION_NAME = 'Anthropic_AI';
const GOOGLE_GENAI_INTEGRATION_NAME = 'Google_GenAI';

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

  describe('isolation scope binding', () => {
    // The stack strategy never forks the isolation scope, so the tests install one that does,
    // the way the Node and Cloudflare strategies fork one per invocation.
    let isolationScope: Scope;

    function withInvocation<T>(callback: () => T): T {
      const previous = isolationScope;
      isolationScope = previous.clone();
      try {
        return callback();
      } finally {
        isolationScope = previous;
      }
    }

    beforeEach(() => {
      isolationScope = getDefaultIsolationScope();
      setAsyncContextStrategy({
        ...getAsyncContextStrategy(getMainCarrier()),
        getIsolationScope: () => isolationScope,
      });
    });

    afterEach(() => {
      setAsyncContextStrategy(undefined);
      _INTERNAL_clearAiProviderSkips();
    });

    it('binds a skip registered inside an invocation to that invocation', () => {
      withInvocation(() => {
        _INTERNAL_skipAiProviderWrapping([OPENAI_INTEGRATION_NAME]);
        expect(_INTERNAL_shouldSkipAiProviderWrapping(OPENAI_INTEGRATION_NAME)).toBe(true);
      });

      expect(_INTERNAL_shouldSkipAiProviderWrapping(OPENAI_INTEGRATION_NAME)).toBe(false);
      withInvocation(() => {
        expect(_INTERNAL_shouldSkipAiProviderWrapping(OPENAI_INTEGRATION_NAME)).toBe(false);
      });
    });

    it('applies a skip registered outside any invocation inside every invocation', () => {
      _INTERNAL_skipAiProviderWrapping([OPENAI_INTEGRATION_NAME]);

      withInvocation(() => {
        expect(_INTERNAL_shouldSkipAiProviderWrapping(OPENAI_INTEGRATION_NAME)).toBe(true);
        expect(_INTERNAL_shouldSkipAiProviderWrapping(ANTHROPIC_AI_INTEGRATION_NAME)).toBe(false);
      });
    });

    it('does not let a skip from one invocation leak into a nested one', () => {
      withInvocation(() => {
        _INTERNAL_skipAiProviderWrapping([OPENAI_INTEGRATION_NAME]);

        withInvocation(() => {
          expect(_INTERNAL_shouldSkipAiProviderWrapping(OPENAI_INTEGRATION_NAME)).toBe(false);
        });

        expect(_INTERNAL_shouldSkipAiProviderWrapping(OPENAI_INTEGRATION_NAME)).toBe(true);
      });
    });

    it('clears only the current and the default isolation scope', () => {
      withInvocation(() => {
        _INTERNAL_skipAiProviderWrapping([OPENAI_INTEGRATION_NAME]);

        withInvocation(() => {
          _INTERNAL_clearAiProviderSkips();
        });

        expect(_INTERNAL_shouldSkipAiProviderWrapping(OPENAI_INTEGRATION_NAME)).toBe(true);
      });
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
