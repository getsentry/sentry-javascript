import { cleanupChildProcesses, createRunner } from '../../utils/runner';

describe('trace metrics', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  test('should capture various metric types', async () => {
    const runner = createRunner(__dirname, 'scenario.ts')
      .withMockSentryServer()
      .expectMetricEnvelope();

    const { envelopes } = await runner.runAsync();

    const metricEnvelopes = envelopes.filter(
      envelope => envelope[0].type === 'metric',
    );

    expect(metricEnvelopes).toHaveLength(1);
    const metricEnvelope = metricEnvelopes[0];
    const metricItems = metricEnvelope[1][0][1].items;

    // Check that all metric types are captured
    const metricNames = metricItems.map((item: any) => item.metric_name);
    expect(metricNames).toContain('api.requests');
    expect(metricNames).toContain('items.processed');
    expect(metricNames).toContain('memory.usage');
    expect(metricNames).toContain('active.connections');
    expect(metricNames).toContain('response.time');
    expect(metricNames).toContain('file.size');
    expect(metricNames).toContain('task.duration');
    expect(metricNames).toContain('batch.size');
    expect(metricNames).toContain('unique.users');
    expect(metricNames).toContain('unique.error.codes');
    expect(metricNames).toContain('span.metric');
    expect(metricNames).toContain('span.gauge');
    expect(metricNames).toContain('user.action');

    // Check specific metrics
    const apiRequestsMetric = metricItems.find((item: any) => item.metric_name === 'api.requests');
    expect(apiRequestsMetric).toMatchObject({
      metric_name: 'api.requests',
      value: 1,
      metric_type: 'counter',
      attributes: expect.objectContaining({
        'endpoint': { value: '/api/users', type: 'string' },
        'method': { value: 'GET', type: 'string' },
        'status': { value: 200, type: 'integer' },
      }),
    });

    const memoryUsageMetric = metricItems.find((item: any) => item.metric_name === 'memory.usage');
    expect(memoryUsageMetric).toMatchObject({
      metric_name: 'memory.usage',
      value: 1024,
      metric_type: 'gauge',
      unit: 'megabyte',
      attributes: expect.objectContaining({
        'process': { value: 'web-server', type: 'string' },
        'region': { value: 'us-east-1', type: 'string' },
      }),
    });

    const responseTimeMetric = metricItems.find((item: any) => item.metric_name === 'response.time');
    expect(responseTimeMetric).toMatchObject({
      metric_name: 'response.time',
      value: 150,
      metric_type: 'histogram',
      unit: 'millisecond',
      attributes: expect.objectContaining({
        'endpoint': { value: '/api/data', type: 'string' },
        'method': { value: 'POST', type: 'string' },
        'status': { value: 201, type: 'integer' },
      }),
    });

    const taskDurationMetric = metricItems.find((item: any) => item.metric_name === 'task.duration');
    expect(taskDurationMetric).toMatchObject({
      metric_name: 'task.duration',
      value: 500,
      metric_type: 'distribution',
      unit: 'millisecond',
      attributes: expect.objectContaining({
        'task': { value: 'data-processing', type: 'string' },
        'priority': { value: 'high', type: 'string' },
      }),
    });

    const uniqueUsersMetric = metricItems.find((item: any) => item.metric_name === 'unique.users');
    expect(uniqueUsersMetric).toMatchObject({
      metric_name: 'unique.users',
      value: 'user-123',
      metric_type: 'set',
      attributes: expect.objectContaining({
        'page': { value: '/dashboard', type: 'string' },
        'action': { value: 'view', type: 'string' },
      }),
    });

    // Check that user context is included
    const userActionMetric = metricItems.find((item: any) => item.metric_name === 'user.action');
    expect(userActionMetric.attributes).toMatchObject({
      'user.id': { value: 'user-456', type: 'string' },
      'user.email': { value: 'test@example.com', type: 'string' },
      'user.name': { value: 'testuser', type: 'string' },
      'action': { value: 'login', type: 'string' },
    });

    // Check that metrics within spans have trace_id
    const spanMetric = metricItems.find((item: any) => item.metric_name === 'span.metric');
    expect(spanMetric.trace_id).toBeDefined();
    expect(spanMetric.trace_id).toMatch(/^[a-f0-9]{32}$/);
  });

  test('should not capture metrics when _enableTraceMetrics is false', async () => {
    const runner = createRunner(__dirname, 'scenario-disabled.ts')
      .withMockSentryServer();

    const { envelopes } = await runner.runAsync();

    const metricEnvelopes = envelopes.filter(
      envelope => envelope[0].type === 'metric',
    );

    expect(metricEnvelopes).toHaveLength(0);
  });

  test('should respect beforeSendMetric callback', async () => {
    const runner = createRunner(__dirname, 'scenario-before-send.ts')
      .withMockSentryServer()
      .expectMetricEnvelope();

    const { envelopes } = await runner.runAsync();

    const metricEnvelopes = envelopes.filter(
      envelope => envelope[0].type === 'metric',
    );

    expect(metricEnvelopes).toHaveLength(1);
    const metricEnvelope = metricEnvelopes[0];
    const metricItems = metricEnvelope[1][0][1].items;

    // Check that filtered metrics are not present
    const metricNames = metricItems.map((item: any) => item.metric_name);
    expect(metricNames).not.toContain('filtered.metric');
    
    // Check that modified metric has updated value
    const modifiedMetric = metricItems.find((item: any) => item.metric_name === 'modified.metric');
    expect(modifiedMetric).toMatchObject({
      metric_name: 'modified.metric',
      value: 200, // Modified from 100
      metric_type: 'gauge',
    });
  });
});
