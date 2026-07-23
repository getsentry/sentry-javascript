import { _AWS_KINESIS_STREAM_NAME as AWS_KINESIS_STREAM_NAME } from '@sentry/conventions/attributes';
import type { NormalizedRequest } from '../types';
import type { RequestMetadata, ServiceExtension } from './ServiceExtension';

export class KinesisServiceExtension implements ServiceExtension {
  public requestPreSpanHook(request: NormalizedRequest): RequestMetadata {
    const streamName = request.commandInput?.StreamName;
    const spanAttributes: Record<string, unknown> = {};

    if (streamName) {
      // oxlint-disable-next-line typescript/no-deprecated -- old-semconv aws.kinesis.stream.name, matched to the OTel aws-sdk integration
      spanAttributes[AWS_KINESIS_STREAM_NAME] = streamName;
    }

    return {
      spanAttributes,
    };
  }
}
