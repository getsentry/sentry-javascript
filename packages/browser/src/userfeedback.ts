import { getCurrentHub } from '@sentry/core';
import type { DsnComponents, EventEnvelope, SdkMetadata, UserFeedback, UserFeedbackItem } from '@sentry/types';
import { createEnvelope, dsnToString, logger } from '@sentry/utils';

/**
 * Sends user feedback to Sentry.
 */
export function captureUserFeedback(feedback: UserFeedback): void {
  const hub = getCurrentHub();
  const client = hub.getClient();
  const transport = client && client.getTransport();

  if (!client) {
    __DEBUG_BUILD__ && logger.log('No client configured, Sentry user feedback will not be sent.');
    return;
  }

  if (!transport) {
    __DEBUG_BUILD__ &&
      logger.log('No transport configured, Sentry user feedback will not be sent.');
    return;
  }

  const envelope = createUserFeedbackEnvelope(feedback, {
    metadata: client.getSdkMetadata && client.getSdkMetadata(),
    dsn: client.getDsn(),
    tunnel: client.getOptions().tunnel,
  });

  void transport.send(envelope);
}

/**
 * Creates an envelope from a user feedback.
 */
export function createUserFeedbackEnvelope(
  feedback: UserFeedback,
  {
    metadata,
    tunnel,
    dsn,
  }: {
    metadata: SdkMetadata | undefined;
    tunnel: string | undefined;
    dsn: DsnComponents | undefined;
  },
): EventEnvelope {
  const headers: EventEnvelope[0] = {
    event_id: feedback.event_id,
    sent_at: new Date().toISOString(),
    ...(metadata &&
      metadata.sdk && {
        sdk: {
          name: metadata.sdk.name,
          version: metadata.sdk.version,
        },
      }),
    ...(!!tunnel && !!dsn && { dsn: dsnToString(dsn) }),
  };
  const item = createUserFeedbackEnvelopeItem(feedback);

  return createEnvelope(headers, [item]);
}

function createUserFeedbackEnvelopeItem(feedback: UserFeedback): UserFeedbackItem {
  const feedbackHeaders: UserFeedbackItem[0] = {
    type: 'user_report',
  };
  return [feedbackHeaders, feedback];
}
