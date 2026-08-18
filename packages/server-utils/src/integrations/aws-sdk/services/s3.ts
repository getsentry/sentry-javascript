import { AWS_S3_BUCKET } from '@sentry/conventions/attributes';
import type { NormalizedRequest } from '../types';
import type { RequestMetadata, ServiceExtension } from './ServiceExtension';

export class S3ServiceExtension implements ServiceExtension {
  public requestPreSpanHook(request: NormalizedRequest): RequestMetadata {
    const bucketName = request.commandInput?.Bucket;
    const spanAttributes: Record<string, unknown> = {};

    if (bucketName) {
      spanAttributes[AWS_S3_BUCKET] = bucketName;
    }

    return {
      spanAttributes,
    };
  }
}
