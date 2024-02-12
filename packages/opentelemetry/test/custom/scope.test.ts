import { makeSession } from '@sentry/core';

import { OpenTelemetryScope } from '../../src/custom/scope';

describe('NodeExperimentalScope', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  it('clone() correctly clones the scope', () => {
    const scope = new OpenTelemetryScope();

    scope['_breadcrumbs'] = [{ message: 'test' }];
    scope['_tags'] = { tag: 'bar' };
    scope['_extra'] = { extra: 'bar' };
    scope['_contexts'] = { os: { name: 'Linux' } };
    scope['_user'] = { id: '123' };
    scope['_level'] = 'warning';
    // we don't care about _span
    scope['_session'] = makeSession({ sid: '123' });
    // we don't care about transactionName
    scope['_fingerprint'] = ['foo'];
    scope['_eventProcessors'] = [() => ({})];
    scope['_requestSession'] = { status: 'ok' };
    scope['_attachments'] = [{ data: '123', filename: 'test.txt' }];
    scope['_sdkProcessingMetadata'] = { sdk: 'bar' };

    // eslint-disable-next-line deprecation/deprecation
    const scope2 = OpenTelemetryScope.clone(scope);

    expect(scope2).toBeInstanceOf(OpenTelemetryScope);
    expect(scope2).not.toBe(scope);

    // Ensure everything is correctly cloned
    expect(scope2['_breadcrumbs']).toEqual(scope['_breadcrumbs']);
    expect(scope2['_tags']).toEqual(scope['_tags']);
    expect(scope2['_extra']).toEqual(scope['_extra']);
    expect(scope2['_contexts']).toEqual(scope['_contexts']);
    expect(scope2['_user']).toEqual(scope['_user']);
    expect(scope2['_level']).toEqual(scope['_level']);
    expect(scope2['_session']).toEqual(scope['_session']);
    expect(scope2['_fingerprint']).toEqual(scope['_fingerprint']);
    expect(scope2['_eventProcessors']).toEqual(scope['_eventProcessors']);
    expect(scope2['_requestSession']).toEqual(scope['_requestSession']);
    expect(scope2['_attachments']).toEqual(scope['_attachments']);
    expect(scope2['_sdkProcessingMetadata']).toEqual(scope['_sdkProcessingMetadata']);
    expect(scope2['_propagationContext']).toEqual(scope['_propagationContext']);

    // Ensure things are not copied by reference
    expect(scope2['_breadcrumbs']).not.toBe(scope['_breadcrumbs']);
    expect(scope2['_tags']).not.toBe(scope['_tags']);
    expect(scope2['_extra']).not.toBe(scope['_extra']);
    expect(scope2['_contexts']).not.toBe(scope['_contexts']);
    expect(scope2['_eventProcessors']).not.toBe(scope['_eventProcessors']);
    expect(scope2['_attachments']).not.toBe(scope['_attachments']);
    expect(scope2['_sdkProcessingMetadata']).not.toBe(scope['_sdkProcessingMetadata']);
    expect(scope2['_propagationContext']).not.toBe(scope['_propagationContext']);

    // These are actually copied by reference
    expect(scope2['_user']).toBe(scope['_user']);
    expect(scope2['_session']).toBe(scope['_session']);
    expect(scope2['_requestSession']).toBe(scope['_requestSession']);
    expect(scope2['_fingerprint']).toBe(scope['_fingerprint']);
  });

  it('clone() works without existing scope', () => {
    // eslint-disable-next-line deprecation/deprecation
    const scope = OpenTelemetryScope.clone(undefined);

    expect(scope).toBeInstanceOf(OpenTelemetryScope);
  });

  it('getSpan returns undefined', () => {
    const scope = new OpenTelemetryScope();

    // Pretend we have a _span set
    scope['_span'] = {} as any;

    // eslint-disable-next-line deprecation/deprecation
    expect(scope.getSpan()).toBeUndefined();
  });

  it('setSpan is a noop', () => {
    const scope = new OpenTelemetryScope();

    // eslint-disable-next-line deprecation/deprecation
    scope.setSpan({} as any);

    expect(scope['_span']).toBeUndefined();
  });
});
