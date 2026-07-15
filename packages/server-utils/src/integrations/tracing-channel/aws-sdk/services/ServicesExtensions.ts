import type { Span } from '@sentry/core';
import type { NormalizedRequest, NormalizedResponse, RequestMetadata } from '../types';
import type { ServiceExtension } from './ServiceExtension';

export class ServicesExtensions implements ServiceExtension {
  // Per-service extensions, keyed by the client's `serviceId` (e.g. `'S3'`). Services without a
  // registered extension still get the base rpc span from the subscriber.
  private _services: Map<string, ServiceExtension> = new Map();

  public requestPreSpanHook(request: NormalizedRequest): RequestMetadata {
    const serviceExtension = this._services.get(request.serviceName);
    if (!serviceExtension) {
      return {};
    }
    return serviceExtension.requestPreSpanHook(request);
  }

  public requestPostSpanHook(request: NormalizedRequest, span: Span): void {
    const serviceExtension = this._services.get(request.serviceName);
    serviceExtension?.requestPostSpanHook?.(request, span);
  }

  public responseHook(response: NormalizedResponse, span: Span): void {
    const serviceExtension = this._services.get(response.request.serviceName);
    serviceExtension?.responseHook?.(response, span);
  }
}
