import type { Span } from '@sentry/core';
import { getClient, getTraceData, hasSpanStreamingEnabled } from '@sentry/core';
import {
  AWS_SNS_TOPIC_ARN as ATTR_AWS_SNS_TOPIC_ARN,
  MESSAGING_DESTINATION as ATTR_MESSAGING_DESTINATION,
  MESSAGING_DESTINATION_NAME,
  MESSAGING_OPERATION_TYPE,
  MESSAGING_SYSTEM,
  SENTRY_KIND,
} from '@sentry/conventions/attributes';
import { ATTR_MESSAGING_DESTINATION_KIND, MESSAGING_DESTINATION_KIND_VALUE_TOPIC } from '../constants';
import type { NormalizedRequest, NormalizedResponse } from '../types';
import { injectPropagationContext } from './MessageAttributes';
import type { RequestMetadata, ServiceExtension } from './ServiceExtension';

/** Stands in for a destination the command does not name. */
const UNKNOWN_DESTINATION = 'unknown';
const SEND_OPERATION = 'send';

/**
 * Streamed names follow the messaging conventions, `<operation type> <destination>`. Transaction-mode
 * names keep the order they had. A destination the command does not name drops out of both.
 */
function buildSpanName(operation: string, destination: string | undefined, isStreamed: boolean): string {
  if (!destination) {
    return operation;
  }
  return isStreamed ? `${operation} ${destination}` : `${destination} ${operation}`;
}

export class SnsServiceExtension implements ServiceExtension {
  public requestPreSpanHook(request: NormalizedRequest): RequestMetadata {
    let spanName = `SNS ${request.commandName}`;
    const spanAttributes: Record<string, unknown> = {
      [MESSAGING_SYSTEM]: 'aws.sns',
      [SENTRY_KIND]: 'client',
    };

    if (request.commandName === 'Publish') {
      spanAttributes[SENTRY_KIND] = 'producer';

      spanAttributes[ATTR_MESSAGING_DESTINATION_KIND] = MESSAGING_DESTINATION_KIND_VALUE_TOPIC;
      const { TopicArn, TargetArn, PhoneNumber } = request.commandInput;
      const destinationName = extractDestinationName(TopicArn, TargetArn, PhoneNumber);
      // oxlint-disable-next-line typescript/no-deprecated -- old-semconv messaging.destination, matched to the OTel aws-sdk integration
      spanAttributes[ATTR_MESSAGING_DESTINATION] = destinationName;
      spanAttributes[MESSAGING_DESTINATION_NAME] = TopicArn || TargetArn || PhoneNumber || UNKNOWN_DESTINATION;
      spanAttributes[MESSAGING_OPERATION_TYPE] = SEND_OPERATION;

      const client = getClient();

      const isStreamed = !!client && hasSpanStreamingEnabled(client);
      // The raw phone number never goes in a name. A `/` in the suffix means a platform-endpoint ARN
      // (`endpoint/GCM/myapp/<uuid>`) rather than a topic, so only a streamed name drops it.
      const named = PhoneNumber ? 'phone_number' : destinationName;
      const destinationForName =
        named === UNKNOWN_DESTINATION || (isStreamed && !PhoneNumber && named.includes('/')) ? undefined : named;

      spanName = buildSpanName(SEND_OPERATION, destinationForName, isStreamed);
    }

    const topicArn = request.commandInput?.TopicArn;
    if (topicArn) {
      spanAttributes[ATTR_AWS_SNS_TOPIC_ARN] = topicArn;
    }

    return {
      spanAttributes,
      spanName,
    };
  }

  public requestPostSpanHook(request: NormalizedRequest, span: Span): void {
    if (request.commandName === 'Publish') {
      const origMessageAttributes = request.commandInput.MessageAttributes ?? {};
      request.commandInput.MessageAttributes = injectPropagationContext(origMessageAttributes, getTraceData({ span }));
    }
  }

  public responseHook(response: NormalizedResponse, span: Span): void {
    const topicArn = response.data?.TopicArn;
    if (topicArn) {
      span.setAttribute(ATTR_AWS_SNS_TOPIC_ARN, topicArn);
    }
  }
}

function extractDestinationName(topicArn: string, targetArn: string, phoneNumber: string): string {
  if (topicArn || targetArn) {
    const arn = topicArn ?? targetArn;
    try {
      return arn.substring(arn.lastIndexOf(':') + 1);
    } catch {
      return arn;
    }
  } else if (phoneNumber) {
    return phoneNumber;
  } else {
    return UNKNOWN_DESTINATION;
  }
}
