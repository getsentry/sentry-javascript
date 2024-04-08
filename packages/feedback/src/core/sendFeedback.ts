import { createAttachmentEnvelope, createEventEnvelope, getClient, withScope } from '@sentry/core';
import type { FeedbackEvent, SendFeedback, SendFeedbackParams } from '@sentry/types';
import { getLocationHref } from '@sentry/utils';
import { FEEDBACK_API_SOURCE, FEEDBACK_WIDGET_SOURCE } from '../constants';
import { prepareFeedbackEvent } from '../util/prepareFeedbackEvent';

/**
 * Public API to send a Feedback item to Sentry
 */
export const sendFeedback: SendFeedback = (
  { name, email, message, attachments, source = FEEDBACK_API_SOURCE, url = getLocationHref() }: SendFeedbackParams,
  { includeReplay = true } = {},
) => {
  if (!message) {
    throw new Error('Unable to submit feedback with empty message');
  }

  const client = getClient();
  const transport = client && client.getTransport();
  const dsn = client && client.getDsn();

  if (!client || !transport || !dsn) {
    throw new Error('Invalid Sentry client');
  }

  const baseEvent: FeedbackEvent = {
    contexts: {
      feedback: {
        contact_email: email,
        name,
        message,
        url,
        source,
      },
    },
    type: 'feedback',
  };

  return withScope(async scope => {
    // No use for breadcrumbs in feedback
    scope.clearBreadcrumbs();

    if ([FEEDBACK_API_SOURCE, FEEDBACK_WIDGET_SOURCE].includes(String(source))) {
      scope.setLevel('info');
    }

    const feedbackEvent = await prepareFeedbackEvent({
      scope,
      client,
      event: baseEvent,
    });

    if (client.emit) {
      client.emit('beforeSendFeedback', feedbackEvent, { includeReplay: Boolean(includeReplay) });
    }

    try {
      const response = await transport.send(
        createEventEnvelope(feedbackEvent, dsn, client.getOptions()._metadata, client.getOptions().tunnel),
      );

      if (attachments && attachments.length) {
        // TODO: https://docs.sentry.io/platforms/javascript/enriching-events/attachments/
        await transport.send(
          createAttachmentEnvelope(
            feedbackEvent,
            attachments,
            dsn,
            client.getOptions()._metadata,
            client.getOptions().tunnel,
          ),
        );
      }

      // Require valid status codes, otherwise can assume feedback was not sent successfully
      if (typeof response.statusCode === 'number' && (response.statusCode < 200 || response.statusCode >= 300)) {
        if (response.statusCode === 0) {
          throw new Error(
            'Unable to send Feedback. This is because of network issues, or because you are using an ad-blocker.',
          );
        }
        throw new Error('Unable to send Feedback. Invalid response from server.');
      }

      return response;
    } catch (err) {
      const error = new Error('Unable to send Feedback');

      try {
        // In case browsers don't allow this property to be writable
        // @ts-expect-error This needs lib es2022 and newer
        error.cause = err;
      } catch {
        // nothing to do
      }
      throw error;
    }
  });
};

/*
 * For reference, the fully built event looks something like this:
 * {
 *     "type": "feedback",
 *     "event_id": "d2132d31b39445f1938d7e21b6bf0ec4",
 *     "timestamp": 1597977777.6189718,
 *     "dist": "1.12",
 *     "platform": "javascript",
 *     "environment": "production",
 *     "release": 42,
 *     "tags": {"transaction": "/organizations/:orgId/performance/:eventSlug/"},
 *     "sdk": {"name": "name", "version": "version"},
 *     "user": {
 *         "id": "123",
 *         "username": "user",
 *         "email": "user@site.com",
 *         "ip_address": "192.168.11.12",
 *     },
 *     "request": {
 *         "url": None,
 *         "headers": {
 *             "user-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.5 Safari/605.1.15"
 *         },
 *     },
 *     "contexts": {
 *         "feedback": {
 *             "message": "test message",
 *             "contact_email": "test@example.com",
 *             "type": "feedback",
 *         },
 *         "trace": {
 *             "trace_id": "4C79F60C11214EB38604F4AE0781BFB2",
 *             "span_id": "FA90FDEAD5F74052",
 *             "type": "trace",
 *         },
 *         "replay": {
 *             "replay_id": "e2d42047b1c5431c8cba85ee2a8ab25d",
 *         },
 *     },
 *   }
 */
