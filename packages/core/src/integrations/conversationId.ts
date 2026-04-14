import type { Client } from '../client';
import { getCurrentScope, getIsolationScope } from '../currentScopes';
import { defineIntegration } from '../integration';
import { GEN_AI_CONVERSATION_ID_ATTRIBUTE } from '../semanticAttributes';
import type { IntegrationFn } from '../types-hoist/integration';
import type { Span } from '../types-hoist/span';
import { spanToJSON } from '../utils/spanUtils';

const INTEGRATION_NAME = 'ConversationId';

const _conversationIdIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setup(client: Client) {
      client.on('spanStart', (span: Span) => {
        const scopeData = getCurrentScope().getScopeData();
        const isolationScopeData = getIsolationScope().getScopeData();

        const conversationId = scopeData.conversationId || isolationScopeData.conversationId;

        if (conversationId) {
          const { op } = spanToJSON(span);

          // Only apply conversation ID to gen_ai spans
          if (!op?.startsWith('gen_ai.')) {
            return;
          }

          span.setAttribute(GEN_AI_CONVERSATION_ID_ATTRIBUTE, conversationId);
        }
      });
    },
  };
}) satisfies IntegrationFn;

/**
 * Automatically applies conversation ID from scope to spans.
 *
 * This integration reads the conversation ID from the current or isolation scope
 * and applies it to spans when they start. This ensures the conversation ID is
 * available for all AI-related operations.
 */
export const conversationIdIntegration = defineIntegration(_conversationIdIntegration);
