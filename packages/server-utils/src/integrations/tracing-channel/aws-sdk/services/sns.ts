import type { Span, SpanKindValue } from '@sentry/core';
import { SPAN_KIND } from '@sentry/core';
import { MESSAGING_DESTINATION_NAME, MESSAGING_SYSTEM } from '@sentry/conventions/attributes';
import {
  ATTR_AWS_SNS_TOPIC_ARN,
  ATTR_MESSAGING_DESTINATION,
  ATTR_MESSAGING_DESTINATION_KIND,
  MESSAGING_DESTINATION_KIND_VALUE_TOPIC,
} from '../constants';
import type { NormalizedRequest, NormalizedResponse } from '../types';
import { injectPropagationContext } from './MessageAttributes';
import type { RequestMetadata, ServiceExtension } from './ServiceExtension';

export class SnsServiceExtension implements ServiceExtension {
  public requestPreSpanHook(request: NormalizedRequest): RequestMetadata {
    let spanKind: SpanKindValue = SPAN_KIND.CLIENT;
    let spanName = `SNS ${request.commandName}`;
    const spanAttributes: Record<string, unknown> = {
      [MESSAGING_SYSTEM]: 'aws.sns',
    };

    if (request.commandName === 'Publish') {
      spanKind = SPAN_KIND.PRODUCER;

      spanAttributes[ATTR_MESSAGING_DESTINATION_KIND] = MESSAGING_DESTINATION_KIND_VALUE_TOPIC;
      const { TopicArn, TargetArn, PhoneNumber } = request.commandInput;
      const destinationName = extractDestinationName(TopicArn, TargetArn, PhoneNumber);
      spanAttributes[ATTR_MESSAGING_DESTINATION] = destinationName;
      spanAttributes[MESSAGING_DESTINATION_NAME] = TopicArn || TargetArn || PhoneNumber || 'unknown';

      spanName = `${PhoneNumber ? 'phone_number' : destinationName} send`;
    }

    const topicArn = request.commandInput?.TopicArn;
    if (topicArn) {
      spanAttributes[ATTR_AWS_SNS_TOPIC_ARN] = topicArn;
    }

    return {
      spanAttributes,
      spanKind,
      spanName,
    };
  }

  public requestPostSpanHook(request: NormalizedRequest, span: Span): void {
    if (request.commandName === 'Publish') {
      const origMessageAttributes = request.commandInput.MessageAttributes ?? {};
      request.commandInput.MessageAttributes = injectPropagationContext(origMessageAttributes, span);
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
    return 'unknown';
  }
}
