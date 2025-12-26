import { SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClickHouseInstrumentation } from '../../../src/integrations/tracing/clickhouse/instrumentation';

// Mock ClickHouse client for testing
class MockClickHouseClient {
  public connection_params = { url: 'http://localhost:8123' };

  async query(_params: any) {
    return {
      query_id: 'test-query-id',
      response_headers: {
        'x-clickhouse-summary': JSON.stringify({
          read_rows: '100',
          read_bytes: '1024',
          elapsed_ns: '5000000',
        }),
      },
    };
  }

  async insert(_params: any) {
    return {
      query_id: 'test-insert-id',
      response_headers: {
        'x-clickhouse-summary': JSON.stringify({
          written_rows: '50',
          written_bytes: '512',
        }),
      },
    };
  }

  async exec(_params: any) {
    return {
      query_id: 'test-exec-id',
      response_headers: {},
    };
  }

  async command(_params: any) {
    return {
      query_id: 'test-command-id',
      response_headers: {},
    };
  }
}

describe('ClickHouseInstrumentation - Functional Tests', () => {
  let contextManager: AsyncHooksContextManager;
  let provider: BasicTracerProvider;
  let exporter: InMemorySpanExporter;
  let instrumentation: ClickHouseInstrumentation;
  let client: MockClickHouseClient;

  beforeAll(() => {
    contextManager = new AsyncHooksContextManager();
    contextManager.enable();
  });

  afterAll(() => {
    contextManager.disable();
  });

  beforeEach(() => {
    // Setup OpenTelemetry test harness
    exporter = new InMemorySpanExporter();
    const processor = new SimpleSpanProcessor(exporter);
    provider = new BasicTracerProvider({
      spanProcessors: [processor],
    });

    // Create real instrumentation instance (not mocked)
    instrumentation = new ClickHouseInstrumentation();
    instrumentation.setTracerProvider(provider);

    // Manually trigger the patch logic on our Mock Client
    const moduleExports = { ClickHouseClient: MockClickHouseClient };

    // @ts-expect-error - Accessing protected method for testing
    const patchResult = instrumentation.init().patch(moduleExports, '0.0.1');

    // Instantiate the patched client
    client = new patchResult.ClickHouseClient();
  });

  afterEach(() => {
    exporter.reset();
    instrumentation.disable();
    vi.clearAllMocks();
  });

  it('instruments query method and creates span with correct attributes', async () => {
    await client.query({ query: 'SELECT * FROM users' });

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0]!;
    expect(span.name).toBe('SELECT clickhouse');
    expect(span.kind).toBe(SpanKind.CLIENT);
    expect(span.attributes['db.system']).toBe('clickhouse');
    expect(span.attributes['db.operation']).toBe('SELECT');
    expect(span.attributes['db.statement']).toBe('SELECT * FROM users');
    expect(span.attributes['sentry.op']).toBe('db.query');

    // Check connection attributes extracted from client instance
    expect(span.attributes['net.peer.name']).toBe('localhost');
    expect(span.attributes['net.peer.port']).toBe(8123);

    // Check execution stats from headers
    expect(span.attributes['clickhouse.read_rows']).toBe(100);
    expect(span.attributes['clickhouse.elapsed_ns']).toBe(5000000);
  });

  it('instruments insert method and reconstructs statement', async () => {
    await client.insert({
      table: 'logs',
      values: [{ id: 1 }],
      format: 'JSONEachRow',
    });

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0]!;
    expect(span.name).toBe('INSERT clickhouse');
    expect(span.attributes['db.operation']).toBe('INSERT');
    expect(span.attributes['db.statement']).toBe('INSERT INTO logs FORMAT JSONEachRow');
    expect(span.attributes['clickhouse.written_rows']).toBe(50);
  });

  it('handles insert with specific columns', async () => {
    await client.insert({
      table: 'metrics',
      columns: ['name', 'value'],
      values: [],
    });

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]!.attributes['db.statement']).toBe('INSERT INTO metrics (name, value) FORMAT JSONCompactEachRow');
  });

  it('instruments exec method', async () => {
    await client.exec({ query: 'CREATE TABLE test (id Int32)' });

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0]!;
    expect(span.name).toBe('CREATE clickhouse');
    expect(span.attributes['db.statement']).toBe('CREATE TABLE test (id Int32)');
  });

  it('instruments command method', async () => {
    await client.command({ query: 'SYSTEM DROP DNS CACHE' });

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0]!;
    expect(span.name).toBe('SYSTEM clickhouse');
  });

  it('sanitizes long queries when maxQueryLength is set', async () => {
    instrumentation.setConfig({ maxQueryLength: 10 });
    await client.query({ query: 'SELECT * FROM very_long_table_name' });

    const spans = exporter.getFinishedSpans();
    expect(spans[0]!.attributes['db.statement']).toBe('SELECT * F...');
  });

  it('suppresses query text when captureQueryText is false', async () => {
    instrumentation.setConfig({ captureQueryText: false });
    await client.query({ query: 'SELECT * FROM secrets' });

    const spans = exporter.getFinishedSpans();
    expect(spans[0]!.attributes['db.statement']).toBeUndefined();
  });

  it('records errors with correct span status', async () => {
    // Create a client that throws synchronously
    class ErrorClient {
      public connection_params = { url: 'http://localhost:8123' };

      async query(_params: any) {
        throw new Error('Connection failed');
      }
    }

    const moduleExports = { ClickHouseClient: ErrorClient };
    // @ts-expect-error - Accessing protected method for testing
    const patchResult = instrumentation.init().patch(moduleExports, '0.0.1');
    const errorClient = new patchResult.ClickHouseClient();

    exporter.reset();
    await expect(errorClient.query({ query: 'SELECT 1' })).rejects.toThrow('Connection failed');

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);

    const span = spans[0]!;
    expect(span.status.code).toBe(SpanStatusCode.ERROR);
    expect(span.status.message).toBe('Connection failed');
    expect(span.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'exception',
          attributes: expect.objectContaining({
            'exception.message': 'Connection failed',
          }),
        }),
      ])
    );
  });

  it('calls responseHook when configured', async () => {
    const hook = vi.fn();
    instrumentation.setConfig({ responseHook: hook });

    await client.query({ query: 'SELECT 1' });

    expect(hook).toHaveBeenCalledTimes(1);
    // responseHook is called early with undefined to ensure sentry.origin is set for both success and error cases
    expect(hook).toHaveBeenCalledWith(
      expect.objectContaining({
        spanContext: expect.any(Function),
      }),
      undefined
    );
  });

  it('uses custom dbName when configured', async () => {
    instrumentation.setConfig({ dbName: 'my_database' });

    await client.query({ query: 'SELECT 1' });

    const spans = exporter.getFinishedSpans();
    expect(spans[0]!.attributes['db.name']).toBe('my_database');
  });

  it('uses custom peer name and port when auto-discovery fails', async () => {
    // Create a client without connection_params to test fallback
    class ClientWithoutParams {
      async query(_params: any) {
        return { query_id: 'test' };
      }
    }

    instrumentation.setConfig({ peerName: 'custom-host', peerPort: 9000 });

    const moduleExports = { ClickHouseClient: ClientWithoutParams };
    // @ts-expect-error - Accessing protected method for testing
    const patchResult = instrumentation.init().patch(moduleExports, '0.0.1');
    const customClient = new patchResult.ClickHouseClient();

    exporter.reset();
    await customClient.query({ query: 'SELECT 1' });

    const spans = exporter.getFinishedSpans();
    expect(spans[0]!.attributes['net.peer.name']).toBe('custom-host');
    expect(spans[0]!.attributes['net.peer.port']).toBe(9000);
  });

  it('extracts operation from various SQL statements', async () => {
    const testCases = [
      { query: 'SELECT * FROM users', expectedOp: 'SELECT' },
      { query: 'INSERT INTO logs VALUES (1)', expectedOp: 'INSERT' },
      { query: 'UPDATE users SET name = ?', expectedOp: 'UPDATE' },
      { query: 'DELETE FROM logs WHERE id = 1', expectedOp: 'DELETE' },
      { query: 'CREATE TABLE test (id Int32)', expectedOp: 'CREATE' },
      { query: 'DROP TABLE test', expectedOp: 'DROP' },
      { query: 'ALTER TABLE test ADD COLUMN name String', expectedOp: 'ALTER' },
      { query: 'TRUNCATE TABLE logs', expectedOp: 'TRUNCATE' },
    ];

    for (const { query } of testCases) {
      await client.query({ query });
    }

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(testCases.length);

    testCases.forEach((testCase, index) => {
      expect(spans[index]!.attributes['db.operation']).toBe(testCase.expectedOp);
      expect(spans[index]!.name).toBe(`${testCase.expectedOp} clickhouse`);
    });
  });

  it('handles captureExecutionStats option', async () => {
    instrumentation.setConfig({ captureExecutionStats: false });

    await client.query({ query: 'SELECT * FROM users' });

    const spans = exporter.getFinishedSpans();
    const span = spans[0]!;

    // Stats should not be captured
    expect(span.attributes['clickhouse.read_rows']).toBeUndefined();
    expect(span.attributes['clickhouse.elapsed_ns']).toBeUndefined();
  });
});
