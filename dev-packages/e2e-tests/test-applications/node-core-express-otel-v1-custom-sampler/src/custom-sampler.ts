import { Attributes, Context, Link, SpanKind } from '@opentelemetry/api';
import { Sampler, SamplingResult } from '@opentelemetry/sdk-trace-node';
import { wrapSamplingDecision } from '@sentry/opentelemetry';

export class CustomSampler implements Sampler {
  public shouldSample(
    context: Context,
    _traceId: string,
    _spanName: string,
    _spanKind: SpanKind,
    attributes: Attributes,
    _links: Link[],
  ): SamplingResult {
    const route = attributes['http.route'];
    const target = attributes['http.target'];
    const decision =
      (typeof route === 'string' && route.includes('/unsampled')) ||
      (typeof target === 'string' && target.includes('/unsampled'))
        ? 0
        : 1;
    return wrapSamplingDecision({
      decision,
      context,
      spanAttributes: attributes,
    });
  }

  public toString(): string {
    return CustomSampler.name;
  }
}
