import type { DsnComponents, EventEnvelope, SdkMetadata, UserFeedback, UserFeedbackItem } from '@sentry/types';
import { createEnvelope, dsnToString } from '@sentry/utils';

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
