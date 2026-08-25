import { beforeEach, describe, expect, it } from 'vitest';
import { SENTRY_SEGMENT_NAME_SOURCE } from '@sentry/conventions/attributes';
import { setCurrentClient } from '../../../src/sdk';
import { SentrySpan } from '../../../src/tracing/sentrySpan';
import { startInactiveSpan, startSpan } from '../../../src/tracing/trace';
import { spanToJSON } from '../../../src/utils/spanUtils';
import { getHttpSpanDetailsFromUrlObject, parseStringToURLObject } from '../../../src/utils/url';
import { getDefaultTestClientOptions, TestClient } from '../../mocks/client';

describe('SENTRY_SEGMENT_NAME_SOURCE exclusivity', () => {
  beforeEach(() => {
    const client = new TestClient(getDefaultTestClientOptions({ tracesSampleRate: 1 }));
    setCurrentClient(client);
    client.init();
  });

  it('keeps the attribute on a root span started with it in attributes', () => {
    const span = startInactiveSpan({
      name: 'GET /users',
      attributes: { [SENTRY_SEGMENT_NAME_SOURCE]: 'url' },
    });

    expect(spanToJSON(span).attributes[SENTRY_SEGMENT_NAME_SOURCE]).toBe('url');
  });

  it('strips the attribute from a child started with it in attributes', () => {
    startSpan({ name: 'parent' }, () => {
      const child = startInactiveSpan({
        name: 'child',
        attributes: { [SENTRY_SEGMENT_NAME_SOURCE]: 'url' },
      });

      expect(spanToJSON(child).attributes).not.toHaveProperty(SENTRY_SEGMENT_NAME_SOURCE);
    });
  });

  it('ignores setAttribute of the source on a child span', () => {
    startSpan({ name: 'parent' }, () => {
      const child = startInactiveSpan({ name: 'child' });
      child.setAttribute(SENTRY_SEGMENT_NAME_SOURCE, 'route');

      expect(spanToJSON(child).attributes).not.toHaveProperty(SENTRY_SEGMENT_NAME_SOURCE);
    });
  });

  it('allows setAttribute of the source on a segment span', () => {
    const span = new SentrySpan({ name: 'segment' });
    span.setAttribute(SENTRY_SEGMENT_NAME_SOURCE, 'route');

    expect(spanToJSON(span).attributes[SENTRY_SEGMENT_NAME_SOURCE]).toBe('route');
  });

  it('does not keep name source on a nested incoming HTTP span', () => {
    const urlObject = parseStringToURLObject('https://example.com/api/users')!;
    const [name, attributes] = getHttpSpanDetailsFromUrlObject(urlObject, 'server', 'test-origin');

    expect(attributes).toHaveProperty(SENTRY_SEGMENT_NAME_SOURCE, 'url');

    startSpan({ name: 'parent' }, () => {
      const child = startInactiveSpan({ name, attributes });
      expect(spanToJSON(child).attributes).not.toHaveProperty(SENTRY_SEGMENT_NAME_SOURCE);
    });
  });

  it('does not include name source on outgoing HTTP span details', () => {
    const urlObject = parseStringToURLObject('https://example.com/api/users')!;
    const [, attributes] = getHttpSpanDetailsFromUrlObject(urlObject, 'client', 'test-origin', undefined, '/api/users');

    expect(attributes).not.toHaveProperty(SENTRY_SEGMENT_NAME_SOURCE);
  });
});
