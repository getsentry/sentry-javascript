import type { InteractionEnvelope, InteractionItem } from '@sentry/types';
import type { InteractionSpan } from '@sentry/types/build/types/interaction';
import { createEnvelope } from '@sentry/utils';

/**
 * Create envelope from Interaction item.
 */
export function createInteractionEnvelope(interaction: InteractionSpan): InteractionEnvelope {
  const headers: InteractionEnvelope[0] = {
    sent_at: new Date().toISOString(),
  };

  const item = createInteractionItem(interaction);
  return createEnvelope<InteractionEnvelope>(headers, [item]);
}

function createInteractionItem(interaction: InteractionSpan): InteractionItem {
  const interactionHeaders: InteractionItem[0] = {
    type: 'interaction',
  };
  return [interactionHeaders, interaction];
}
