/*
 * Copyright The OpenTelemetry Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-aws-sdk
 * - Upstream version: @opentelemetry/instrumentation-aws-sdk@0.73.0
 */
/* eslint-disable */

import { Tracer, SpanKind, Span, propagation, trace, ROOT_CONTEXT, Attributes } from '@opentelemetry/api';
import { RequestMetadata, ServiceExtension } from './ServiceExtension';
import type { SQS } from '../aws-sdk.types';
import { AwsSdkInstrumentationConfig, NormalizedRequest, NormalizedResponse } from '../types';
import { ATTR_URL_FULL } from '@opentelemetry/semantic-conventions';
import {
  ATTR_MESSAGING_BATCH_MESSAGE_COUNT,
  ATTR_MESSAGING_DESTINATION_NAME,
  ATTR_MESSAGING_MESSAGE_ID,
  ATTR_MESSAGING_OPERATION_TYPE,
  ATTR_MESSAGING_SYSTEM,
} from '../semconv';
import {
  contextGetter,
  extractPropagationContext,
  injectPropagationContext,
  addPropagationFieldsToAttributeNames,
} from './MessageAttributes';

export class SqsServiceExtension implements ServiceExtension {
  requestPreSpanHook(request: NormalizedRequest, _config: AwsSdkInstrumentationConfig): RequestMetadata {
    const queueUrl = this.extractQueueUrl(request.commandInput);
    const queueName = this.extractQueueNameFromUrl(queueUrl);
    let spanKind: SpanKind = SpanKind.CLIENT;
    let spanName: string | undefined;

    const spanAttributes: Attributes = {
      [ATTR_MESSAGING_SYSTEM]: 'aws_sqs',
      [ATTR_MESSAGING_DESTINATION_NAME]: queueName,
      [ATTR_URL_FULL]: queueUrl,
    };

    let isIncoming = false;

    switch (request.commandName) {
      case 'ReceiveMessage':
        {
          isIncoming = true;
          spanKind = SpanKind.CONSUMER;
          spanName = `${queueName} receive`;
          spanAttributes[ATTR_MESSAGING_OPERATION_TYPE] = 'receive';

          request.commandInput.MessageAttributeNames = addPropagationFieldsToAttributeNames(
            request.commandInput.MessageAttributeNames,
            propagation.fields(),
          );
        }
        break;

      case 'SendMessage':
      case 'SendMessageBatch':
        spanKind = SpanKind.PRODUCER;
        spanName = `${queueName} send`;
        break;
    }

    return {
      isIncoming,
      spanAttributes,
      spanKind,
      spanName,
    };
  }

  requestPostSpanHook = (request: NormalizedRequest) => {
    switch (request.commandName) {
      case 'SendMessage':
        {
          const origMessageAttributes = request.commandInput['MessageAttributes'] ?? {};
          if (origMessageAttributes) {
            request.commandInput['MessageAttributes'] = injectPropagationContext(origMessageAttributes);
          }
        }
        break;

      case 'SendMessageBatch':
        {
          const entries = request.commandInput?.Entries;
          if (Array.isArray(entries)) {
            entries.forEach((messageParams: { MessageAttributes: SQS.MessageBodyAttributeMap }) => {
              messageParams.MessageAttributes = injectPropagationContext(messageParams.MessageAttributes ?? {});
            });
          }
        }
        break;
    }
  };

  responseHook = (response: NormalizedResponse, span: Span, _tracer: Tracer, config: AwsSdkInstrumentationConfig) => {
    switch (response.request.commandName) {
      case 'SendMessage':
        span.setAttribute(ATTR_MESSAGING_MESSAGE_ID, response?.data?.MessageId);
        break;

      case 'SendMessageBatch':
        // TODO: How should this be handled?
        break;

      case 'ReceiveMessage': {
        const messages: SQS.Message[] = response?.data?.Messages || [];

        span.setAttribute(ATTR_MESSAGING_BATCH_MESSAGE_COUNT, messages.length);

        for (const message of messages) {
          const propagatedContext = propagation.extract(
            ROOT_CONTEXT,
            extractPropagationContext(message, config.sqsExtractContextPropagationFromPayload),
            contextGetter,
          );

          const spanContext = trace.getSpanContext(propagatedContext);

          if (spanContext) {
            span.addLink({
              context: spanContext,
              attributes: {
                [ATTR_MESSAGING_MESSAGE_ID]: message.MessageId,
              },
            });
          }
        }
        break;
      }
    }
  };

  extractQueueUrl = (commandInput: Record<string, any>): string => {
    return commandInput?.QueueUrl;
  };

  extractQueueNameFromUrl = (queueUrl: string): string | undefined => {
    if (!queueUrl) return undefined;

    const segments = queueUrl.split('/');
    if (segments.length === 0) return undefined;

    return segments[segments.length - 1];
  };
}
