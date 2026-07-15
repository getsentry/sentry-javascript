import { SPAN_KIND } from '@sentry/core';
import { AWS_KINESIS_STREAM_NAME } from '../constants';
import type { NormalizedRequest } from '../types';
import type { RequestMetadata, ServiceExtension } from './ServiceExtension';

export class KinesisServiceExtension implements ServiceExtension {
  public requestPreSpanHook(request: NormalizedRequest): RequestMetadata {
    const streamName = request.commandInput?.StreamName;
    const spanAttributes: Record<string, unknown> = {};

    if (streamName) {
      spanAttributes[AWS_KINESIS_STREAM_NAME] = streamName;
    }

    return {
      spanAttributes,
      spanKind: SPAN_KIND.CLIENT,
    };
  }
}
