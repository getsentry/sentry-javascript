import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

export function waitForNavigationSpan(name: string, navigationType: string) {
  return waitForStreamedSpan('nextjs-16', span => {
    return (
      span.name === name &&
      getSpanOp(span) === 'navigation' &&
      span.is_segment &&
      span.attributes['navigation.type']?.value === navigationType
    );
  });
}
