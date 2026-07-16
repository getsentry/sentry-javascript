import type { Span, SpanKindValue } from '@sentry/core';
import { getTraceData, propagationContextFromHeaders, SPAN_KIND } from '@sentry/core';
import {
  MESSAGING_BATCH_MESSAGE_COUNT,
  MESSAGING_DESTINATION_NAME,
  MESSAGING_MESSAGE_ID,
  MESSAGING_OPERATION_TYPE,
  MESSAGING_SYSTEM,
  URL_FULL,
} from '@sentry/conventions/attributes';
import type { SQS } from '../aws-sdk.types';
import type { CommandInput, NormalizedRequest, NormalizedResponse } from '../types';
import {
  addPropagationFieldsToAttributeNames,
  extractPropagationHeaders,
  injectPropagationContext,
} from './MessageAttributes';
import type { RequestMetadata, ServiceExtension } from './ServiceExtension';

export class SqsServiceExtension implements ServiceExtension {
  public requestPreSpanHook(request: NormalizedRequest): RequestMetadata {
    const queueUrl = extractQueueUrl(request.commandInput);
    const queueName = extractQueueNameFromUrl(queueUrl);
    let spanKind: SpanKindValue = SPAN_KIND.CLIENT;
    let spanName: string | undefined;

    const spanAttributes: Record<string, unknown> = {
      [MESSAGING_SYSTEM]: 'aws_sqs',
      [MESSAGING_DESTINATION_NAME]: queueName,
      [URL_FULL]: queueUrl,
    };

    switch (request.commandName) {
      case 'ReceiveMessage':
        {
          spanKind = SPAN_KIND.CONSUMER;
          spanName = `${queueName} receive`;
          spanAttributes[MESSAGING_OPERATION_TYPE] = 'receive';

          request.commandInput.MessageAttributeNames = addPropagationFieldsToAttributeNames(
            request.commandInput.MessageAttributeNames,
          );
        }
        break;

      case 'SendMessage':
      case 'SendMessageBatch':
        spanKind = SPAN_KIND.PRODUCER;
        spanName = `${queueName} send`;
        break;
    }

    return {
      spanAttributes,
      spanKind,
      spanName,
    };
  }

  public requestPostSpanHook(request: NormalizedRequest, span: Span): void {
    switch (request.commandName) {
      case 'SendMessage':
        {
          const origMessageAttributes = request.commandInput.MessageAttributes ?? {};
          request.commandInput.MessageAttributes = injectPropagationContext(
            origMessageAttributes,
            getTraceData({ span }),
          );
        }
        break;

      case 'SendMessageBatch':
        {
          const entries = request.commandInput?.Entries;
          if (Array.isArray(entries)) {
            // Serialized once; the headers are identical for every entry of the batch.
            const traceData = getTraceData({ span });
            entries.forEach((messageParams: { MessageAttributes: SQS.MessageBodyAttributeMap }) => {
              messageParams.MessageAttributes = injectPropagationContext(
                messageParams.MessageAttributes ?? {},
                traceData,
              );
            });
          }
        }
        break;
    }
  }

  public responseHook(response: NormalizedResponse, span: Span): void {
    switch (response.request.commandName) {
      case 'SendMessage':
        span.setAttribute(MESSAGING_MESSAGE_ID, response?.data?.MessageId);
        break;

      case 'SendMessageBatch':
        break;

      case 'ReceiveMessage': {
        const messages: SQS.Message[] = response?.data?.Messages || [];

        span.setAttribute(MESSAGING_BATCH_MESSAGE_COUNT, messages.length);

        for (const message of messages) {
          linkReceivedMessageToProducer(span, message);
        }
        break;
      }
    }
  }
}

/**
 * Link a received SQS message's span back to the producer trace carried in its propagation headers.
 * No-op when the message has no (valid) `sentry-trace`/`baggage` attributes.
 */
function linkReceivedMessageToProducer(span: Span, message: SQS.Message): void {
  const headers = extractPropagationHeaders(message);
  if (!headers) {
    return;
  }

  const { parentSpanId, traceId, sampled } = propagationContextFromHeaders(headers.sentryTrace, headers.baggage);
  if (traceId && parentSpanId) {
    span.addLink({
      context: {
        traceId,
        spanId: parentSpanId,
        traceFlags: sampled ? 1 : 0,
      },
      attributes: {
        [MESSAGING_MESSAGE_ID]: message.MessageId,
      },
    });
  }
}

function extractQueueUrl(commandInput: CommandInput): string {
  return commandInput?.QueueUrl;
}

function extractQueueNameFromUrl(queueUrl: string): string | undefined {
  if (!queueUrl) return undefined;

  const segments = queueUrl.split('/');
  if (segments.length === 0) return undefined;

  return segments[segments.length - 1];
}
