import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getCurrentScope, getIsolationScope, setCurrentClient, startSpan } from '../../../src';
import { conversationIdIntegration } from '../../../src/integrations/conversationId';
import { GEN_AI_CONVERSATION_ID_ATTRIBUTE } from '../../../src/semanticAttributes';
import { spanToJSON } from '../../../src/utils/spanUtils';
import { getDefaultTestClientOptions, TestClient } from '../../mocks/client';

describe('ConversationId', () => {
  beforeEach(() => {
    const testClient = new TestClient(
      getDefaultTestClientOptions({
        tracesSampleRate: 1,
      }),
    );
    setCurrentClient(testClient);
    testClient.init();
    testClient.addIntegration(conversationIdIntegration());
  });

  afterEach(() => {
    getCurrentScope().setClient(undefined);
    getCurrentScope().setConversationId(null);
    getIsolationScope().setConversationId(null);
  });

  it('applies conversation ID from current scope to span', () => {
    getCurrentScope().setConversationId('conv_test_123');

    startSpan({ name: 'test-span' }, span => {
      const spanJSON = spanToJSON(span);
      expect(spanJSON.data[GEN_AI_CONVERSATION_ID_ATTRIBUTE]).toBe('conv_test_123');
    });
  });

  it('applies conversation ID from isolation scope when current scope does not have one', () => {
    getIsolationScope().setConversationId('conv_isolation_456');

    startSpan({ name: 'test-span' }, span => {
      const spanJSON = spanToJSON(span);
      expect(spanJSON.data[GEN_AI_CONVERSATION_ID_ATTRIBUTE]).toBe('conv_isolation_456');
    });
  });

  it('prefers current scope over isolation scope', () => {
    getCurrentScope().setConversationId('conv_current_789');
    getIsolationScope().setConversationId('conv_isolation_999');

    startSpan({ name: 'test-span' }, span => {
      const spanJSON = spanToJSON(span);
      expect(spanJSON.data[GEN_AI_CONVERSATION_ID_ATTRIBUTE]).toBe('conv_current_789');
    });
  });

  it('does not apply conversation ID when not set in scope', () => {
    startSpan({ name: 'test-span' }, span => {
      const spanJSON = spanToJSON(span);
      expect(spanJSON.data[GEN_AI_CONVERSATION_ID_ATTRIBUTE]).toBeUndefined();
    });
  });

  it('works when conversation ID is unset with null', () => {
    getCurrentScope().setConversationId('conv_test_123');
    getCurrentScope().setConversationId(null);

    startSpan({ name: 'test-span' }, span => {
      const spanJSON = spanToJSON(span);
      expect(spanJSON.data[GEN_AI_CONVERSATION_ID_ATTRIBUTE]).toBeUndefined();
    });
  });

  it('applies conversation ID to nested spans', () => {
    getCurrentScope().setConversationId('conv_nested_abc');

    startSpan({ name: 'parent-span' }, () => {
      startSpan({ name: 'child-span' }, childSpan => {
        const childJSON = spanToJSON(childSpan);
        expect(childJSON.data[GEN_AI_CONVERSATION_ID_ATTRIBUTE]).toBe('conv_nested_abc');
      });
    });
  });

  it('scope conversation ID overrides explicitly set attribute', () => {
    getCurrentScope().setConversationId('conv_from_scope');

    startSpan(
      {
        name: 'test-span',
        attributes: {
          [GEN_AI_CONVERSATION_ID_ATTRIBUTE]: 'conv_explicit',
        },
      },
      span => {
        const spanJSON = spanToJSON(span);
        expect(spanJSON.data[GEN_AI_CONVERSATION_ID_ATTRIBUTE]).toBe('conv_from_scope');
      },
    );
  });
});
