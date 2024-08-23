// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
import { randomUUID } from 'node:crypto';

const traceId = randomUUID().replace(/-/g, '');
const spanId = randomUUID().replace(/-/g, '').slice(0, 16);

const sentryTrace = `${traceId}-${spanId}-1`;
const baggage = `sentry-trace_id=${traceId}`;

process.env.SENTRY_MUT_SENTRY_TRACE = sentryTrace;
process.env.SENTRY_MUT_BAGGAGE = baggage;

console.log('Starting Trace with:');
console.log(`- sentry-trace: ${sentryTrace}`);
console.log(`- baggage: ${baggage}`);

export default {
  sentryTrace,
  baggage,
};
