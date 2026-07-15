import type { Span } from '@sentry/core';
import { SPAN_KIND } from '@sentry/core';
import { AWS_SECRETSMANAGER_SECRET_ARN as ATTR_AWS_SECRETSMANAGER_SECRET_ARN } from '@sentry/conventions/attributes';
import type { NormalizedRequest, NormalizedResponse } from '../types';
import type { RequestMetadata, ServiceExtension } from './ServiceExtension';

export class SecretsManagerServiceExtension implements ServiceExtension {
  public requestPreSpanHook(request: NormalizedRequest): RequestMetadata {
    const secretId = request.commandInput?.SecretId;
    const spanAttributes: Record<string, unknown> = {};
    if (typeof secretId === 'string' && secretId.startsWith('arn:aws:secretsmanager:')) {
      spanAttributes[ATTR_AWS_SECRETSMANAGER_SECRET_ARN] = secretId;
    }

    return {
      spanAttributes,
      spanKind: SPAN_KIND.CLIENT,
    };
  }

  public responseHook(response: NormalizedResponse, span: Span): void {
    const secretArn = response.data?.ARN;
    if (secretArn) {
      span.setAttribute(ATTR_AWS_SECRETSMANAGER_SECRET_ARN, secretArn);
    }
  }
}
