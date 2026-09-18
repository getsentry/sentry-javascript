import type { Span } from '@sentry/core';
import { getClient, getTraceData, hasSpanStreamingEnabled, propagationContextFromHeaders } from '@sentry/core';
import {
  MESSAGING_BATCH_MESSAGE_COUNT,
  MESSAGING_DESTINATION_NAME,
  MESSAGING_MESSAGE_ID,
  MESSAGING_OPERATION_TYPE,
  MESSAGING_SYSTEM,
  SENTRY_KIND,
  URL_FULL,
} from '@sentry/conventions/attributes';
import { QUEUE_PUBLISH, QUEUE_RECEIVE } from '@sentry/conventions/op';
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
    let operation: string | undefined;
    let spanOp: string | undefined;

    const spanAttributes: Record<string, unknown> = {
      [MESSAGING_SYSTEM]: 'aws_sqs',
      [MESSAGING_DESTINATION_NAME]: queueName,
      // oxlint-disable-next-line sdk/no-unfiltered-url-attributes -- SQS queue identifier, not an HTTP request URL
      [URL_FULL]: queueUrl,
      [SENTRY_KIND]: 'client',
    };

    switch (request.commandName) {
      case 'ReceiveMessage':
        {
          operation = 'receive';
          spanOp = QUEUE_RECEIVE;
          spanAttributes[SENTRY_KIND] = 'consumer';

          request.commandInput.MessageAttributeNames = addPropagationFieldsToAttributeNames(
            request.commandInput.MessageAttributeNames,
          );
        }
        break;

      case 'SendMessage':
      case 'SendMessageBatch':
        operation = 'send';
        spanOp = QUEUE_PUBLISH;
        spanAttributes[SENTRY_KIND] = 'producer';
        break;
    }

    if (operation) {
      spanAttributes[MESSAGING_OPERATION_TYPE] = operation;
    }

    const client = getClient();
    const isStreamed = !!client && hasSpanStreamingEnabled(client);

    return {
      spanAttributes,
      spanName: buildSpanName(operation, queueName, isStreamed),
      // Fallback to `rpc` if there's no messaging operation
      spanOp,
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

/**
 * Streamed names follow the messaging conventions, `<operation type> <destination>`. Transaction-mode
 * names keep the order they had. Either way a command with no `QueueUrl` drops to the operation alone,
 * which wins over the aws-sdk house style (`SQS.ReceiveMessage`). That style still names the commands
 * with no messaging operation, which is why this returns undefined for them.
 */
function buildSpanName(
  operation: string | undefined,
  queueName: string | undefined,
  isStreamed: boolean,
): string | undefined {
  if (!operation) {
    return undefined;
  }
  if (!queueName) {
    return operation;
  }
  return isStreamed ? `${operation} ${queueName}` : `${queueName} ${operation}`;
}

function extractQueueUrl(commandInput: CommandInput): string {
  return commandInput?.QueueUrl;
}

function extractQueueNameFromUrl(queueUrl: string): string | undefined {
  if (!queueUrl) return undefined;

  const segments = queueUrl.split('/');
  if (segments.length === 0) return undefined;

  // A trailing slash leaves an empty last segment, which is not a queue name
  return segments[segments.length - 1] || undefined;
}
