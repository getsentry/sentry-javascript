import { expect } from 'vitest';
import type { Event, TransactionEvent } from '@sentry/types';

export async function testResults(events: Event[]): Promise<void> {
  // Get all transaction events (which represent traces)
  const transactionEvents = events.filter((event): event is TransactionEvent => event.type === 'transaction');

  // Should have at least 2 transaction events (one for each withMonitor call)
  expect(transactionEvents.length).toBeGreaterThanOrEqual(2);

  // Get trace IDs from the transactions
  const traceIds = transactionEvents.map(event => event.contexts?.trace?.trace_id).filter(Boolean);

  // Should have at least 2 different trace IDs (verifying trace isolation)
  const uniqueTraceIds = [...new Set(traceIds)];
  expect(uniqueTraceIds.length).toBeGreaterThanOrEqual(2);

  console.log('✅ Found traces with different trace IDs:', uniqueTraceIds);
}
