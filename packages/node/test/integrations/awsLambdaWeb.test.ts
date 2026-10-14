import {
  CLOUD_ACCOUNT_ID,
  CLOUD_PLATFORM,
  CLOUD_PROVIDER,
  CLOUD_REGION,
  FAAS_COLDSTART,
  FAAS_INVOCATION_ID,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import type { Integration } from '@sentry/core';
import {
  getCurrentScope,
  getIsolationScope,
  SentrySpan,
  spanStreamingIntegration,
  spanToJSON,
  startInactiveSpan,
  startSpan,
  withIsolationScope,
} from '@sentry/core';
import { setAsyncLocalStorageAsyncContextStrategy } from '@sentry/server-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NodeClient } from '../../src/sdk/client';

describe('awsLambdaWebIntegration', () => {
  let integration: Integration;
  let client: NodeClient;

  beforeEach(async () => {
    vi.resetModules();
    setAsyncLocalStorageAsyncContextStrategy();
    vi.stubEnv('AWS_LAMBDA_HTTP_ENDPOINT', '0.0.0.0:3000');
    vi.stubEnv('AWS_REGION', 'us-east-1');
    vi.stubEnv('AWS_ACCOUNT_ID', '123456789012');
    vi.stubEnv('AWS_LAMBDA_FUNCTION_MEMORY_SIZE', '2048');
    vi.stubEnv('AWS_LAMBDA_INITIALIZATION_TYPE', 'native-http');
    const { awsLambdaWebIntegration } = await import('../../src/integrations/awsLambdaWeb');
    integration = awsLambdaWebIntegration();
    client = new NodeClient({
      dsn: 'https://public@example.com/1',
      integrations: [],
      stackParser: () => [],
      transport: () => ({ send: () => Promise.resolve({}), flush: () => Promise.resolve(true) }),
    });
    getCurrentScope().setClient(client);
  });

  afterEach(async () => {
    client.dispose();
    vi.restoreAllMocks();
    await client.close();
    getCurrentScope().setClient(undefined);
    getIsolationScope().setContext('aws.lambda', null);
    vi.unstubAllEnvs();
  });

  it('is inert outside Web Functions', async () => {
    vi.stubEnv('AWS_LAMBDA_HTTP_ENDPOINT', undefined);
    const { awsLambdaWebIntegration } = await import('../../src/integrations/awsLambdaWeb');
    const disabled = awsLambdaWebIntegration();
    disabled.setup!(client);
    const span = spanToJSON(new SentrySpan({ name: 'outside Web Functions' }));

    disabled.processSegmentSpan!(span, client);

    expect(disabled.processEvent!({}, {}, client)).toEqual({});
    expect(span.attributes).toEqual({ [SENTRY_ORIGIN]: 'manual' });
  });

  it('keeps request context isolated and assigns cold start before tracing or sampling', async () => {
    integration.setup!(client);
    let releaseFirst!: () => void;
    const barrier = new Promise<void>(resolve => {
      releaseFirst = resolve;
    });
    const first = withIsolationScope(async scope => {
      client.emit(
        'httpServerRequest',
        {},
        {},
        { headers: { 'lambda-web-request-id': 'first', 'lambda-web-endpoint-name': 'prod' } },
      );
      await barrier;
      return scope.getScopeData();
    });
    const second = withIsolationScope(scope => {
      client.emit(
        'httpServerRequest',
        {},
        {},
        { headers: { 'lambda-web-request-id': 'second', 'lambda-web-endpoint-name': 'canary' } },
      );
      return scope.getScopeData();
    });
    releaseFirst();
    const firstData = await first;

    expect(firstData.contexts['aws.lambda']).toEqual({
      cold_start: true,
      aws_request_id: 'first',
      endpoint_name: 'prod',
    });
    expect(second.contexts['aws.lambda']).toEqual({
      cold_start: false,
      aws_request_id: 'second',
      endpoint_name: 'canary',
    });
    expect(firstData.attributes).toEqual({});
    expect(second.attributes).toEqual({});
    expect(getIsolationScope().getScopeData().contexts['aws.lambda']).toBeUndefined();
  });

  it('preserves request and user context while adding environment metadata', () => {
    const event = {
      contexts: { 'aws.lambda': { aws_request_id: 'request' }, cloud_resource: { [CLOUD_REGION]: 'custom' } },
    };
    expect(integration.processEvent!(event, {}, client)).toEqual({
      contexts: {
        'aws.lambda': { aws_request_id: 'request', memory_size: 2_147_483_648, initialization_type: 'native-http' },
        cloud_resource: {
          [CLOUD_PROVIDER]: 'aws',
          [CLOUD_PLATFORM]: 'aws_lambda',
          [CLOUD_REGION]: 'custom',
          [CLOUD_ACCOUNT_ID]: '123456789012',
        },
      },
    });
  });

  it('preserves existing Lambda context while replacing request-specific values', () => {
    integration.setup!(client);

    withIsolationScope(scope => {
      scope.setContext('aws.lambda', {
        function_name: 'checkout',
        revision_id: 'rev-current',
        aws_request_id: 'previous-request',
        endpoint_name: 'previous-endpoint',
        cold_start: false,
      });
      client.emit(
        'httpServerRequest',
        {},
        {},
        { headers: { 'lambda-web-request-id': 'current-request', 'lambda-web-endpoint-name': 'prod' } },
      );

      expect(scope.getScopeData().contexts['aws.lambda']).toEqual({
        function_name: 'checkout',
        revision_id: 'rev-current',
        aws_request_id: 'current-request',
        endpoint_name: 'prod',
        cold_start: true,
      });
    });
  });

  it('preserves explicit root span attributes while filling missing metadata', () => {
    integration.setup!(client);

    withIsolationScope(() => {
      client.emit('httpServerRequest', {}, {}, { headers: { 'lambda-web-request-id': 'request' } });
      const span = new SentrySpan({
        name: 'request',
        attributes: { [CLOUD_REGION]: 'custom-region', [FAAS_COLDSTART]: false, 'faas.max_memory': 0 },
      });
      const spanJSON = spanToJSON(span);
      integration.processSegmentSpan!(spanJSON, client);

      expect(spanJSON.attributes).toEqual({
        [SENTRY_ORIGIN]: 'manual',
        [CLOUD_REGION]: 'custom-region',
        [CLOUD_PROVIDER]: 'aws',
        [CLOUD_PLATFORM]: 'aws_lambda',
        [CLOUD_ACCOUNT_ID]: '123456789012',
        [FAAS_COLDSTART]: false,
        [FAAS_INVOCATION_ID]: 'request',
        'faas.max_memory': 0,
        'aws.lambda.initialization_type': 'native-http',
      });
    });
  });

  it('clears inherited request identifiers when headers are absent', () => {
    integration.setup!(client);

    withIsolationScope(scope => {
      scope.setContext('aws.lambda', { revision_id: 'rev-current', aws_request_id: 'old', endpoint_name: 'old' });
      client.emit('httpServerRequest', {}, {}, { headers: {} });
      const span = new SentrySpan({ name: 'request' });
      const spanJSON = spanToJSON(span);
      integration.processSegmentSpan!(spanJSON, client);

      expect(scope.getScopeData().contexts['aws.lambda']).toEqual({ revision_id: 'rev-current', cold_start: true });
      expect(spanJSON.attributes).not.toHaveProperty([FAAS_INVOCATION_ID]);
      expect(spanJSON.attributes).not.toHaveProperty(['aws.lambda.web.endpoint_name']);
    });
  });

  it('enriches segment spans without enriching child spans', () => {
    client.getOptions().tracesSampleRate = 1;
    client.addIntegration(integration);
    client.addIntegration(spanStreamingIntegration());
    const captured = vi.fn();
    client.on('processSpan', span => {
      captured(span.is_segment, span.attributes[FAAS_INVOCATION_ID], span.attributes[CLOUD_PLATFORM]);
    });

    withIsolationScope(() => {
      client.emit('httpServerRequest', {}, {}, { headers: { 'lambda-web-request-id': 'request' } });
      startSpan({ name: 'request' }, () => {
        startInactiveSpan({ name: 'child' }).end();
      });
    });

    expect(captured).toHaveBeenCalledTimes(2);
    expect(captured).toHaveBeenNthCalledWith(1, false, undefined, undefined);
    expect(captured).toHaveBeenNthCalledWith(2, true, 'request', 'aws_lambda');
    expect(getIsolationScope().getScopeData().contexts['aws.lambda']).toBeUndefined();
  });

  it('adds static metadata to segment spans outside requests without overwriting attributes', () => {
    const span = spanToJSON(new SentrySpan({ name: 'startup', attributes: { [CLOUD_REGION]: 'custom-region' } }));

    integration.processSegmentSpan!(span, client);

    expect(span.attributes).toEqual({
      [SENTRY_ORIGIN]: 'manual',
      [CLOUD_REGION]: 'custom-region',
      [CLOUD_PROVIDER]: 'aws',
      [CLOUD_PLATFORM]: 'aws_lambda',
      [CLOUD_ACCOUNT_ID]: '123456789012',
      'faas.max_memory': 2_147_483_648,
      'aws.lambda.initialization_type': 'native-http',
    });
  });

  it.each([undefined, '', 'invalid', '0', '-1', 'Infinity', '1e308'])(
    'omits invalid memory size %s from spans and error contexts',
    async memory => {
      vi.stubEnv('AWS_LAMBDA_FUNCTION_MEMORY_SIZE', memory);
      const { awsLambdaWebIntegration } = await import('../../src/integrations/awsLambdaWeb');
      const integration = awsLambdaWebIntegration();
      const span = spanToJSON(new SentrySpan({ name: 'startup' }));
      const event = { contexts: { 'aws.lambda': {} } };

      integration.processSegmentSpan!(span, client);
      integration.processEvent!(event, {}, client);

      expect(span.attributes).not.toHaveProperty(['faas.max_memory']);
      expect(event.contexts['aws.lambda']).toHaveProperty('memory_size', undefined);
    },
  );

  it('omits unavailable metadata and does not infer function identity', async () => {
    vi.stubEnv('AWS_REGION', undefined);
    vi.stubEnv('AWS_ACCOUNT_ID', undefined);
    vi.stubEnv('AWS_LAMBDA_FUNCTION_MEMORY_SIZE', 'invalid');
    vi.stubEnv('AWS_LAMBDA_INITIALIZATION_TYPE', undefined);
    const { awsLambdaWebIntegration } = await import('../../src/integrations/awsLambdaWeb');
    const minimal = awsLambdaWebIntegration();
    minimal.setup!(client);
    withIsolationScope(scope => {
      client.emit('httpServerRequest', {}, {}, { headers: {} });
      expect(scope.getScopeData().contexts['aws.lambda']).toEqual({ cold_start: true });
    });
    expect(minimal.processEvent!({}, {}, client)).toEqual({
      contexts: {
        cloud_resource: { [CLOUD_PROVIDER]: 'aws', [CLOUD_PLATFORM]: 'aws_lambda' },
        'aws.lambda': {},
      },
    });
  });
});
