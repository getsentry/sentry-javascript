import type { Span } from '@opentelemetry/api';
import type { InstrumentationConfig } from '@opentelemetry/instrumentation';

export interface ClickHouseInstrumentationConfig extends InstrumentationConfig {
  /**
   * Hook called before the span ends. Can be used to add custom attributes.
   */
  responseHook?: (span: Span, result: unknown) => void;

  /**
   * Database name to include in spans.
   */
  dbName?: string;

  /**
   * Whether to capture full SQL query text in spans.
   * Defaults to true.
   */
  captureQueryText?: boolean;

  /**
   * Maximum length for captured query text. Queries longer than this will be truncated.
   * Defaults to 1000 characters.
   */
  maxQueryLength?: number;

  /**
   * Remote hostname or IP address of the ClickHouse server.
   * Example: "clickhouse.example.com" or "192.168.1.100"
   */
  peerName?: string;

  /**
   * Remote port number of the ClickHouse server.
   * Example: 8123 for HTTP, 9000 for native protocol
   */
  peerPort?: number;

  /**
   * Whether to capture ClickHouse execution statistics from response headers.
   * This includes read/written rows, bytes, elapsed time, etc.
   * Defaults to true.
   */
  captureExecutionStats?: boolean;
}
