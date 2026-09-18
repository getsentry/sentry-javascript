import { collectStreamedSpans, getSpanOp } from '@sentry-internal/test-utils';
import type { SerializedStreamedSpan } from '@sentry/core';

// `Deno.serve` has no route information, so with span streaming the http.server segment is
// named after the method only; the path lives in `url.path`.
export function isSegmentFor(path: string): (span: SerializedStreamedSpan) => boolean {
  return span => getSpanOp(span) === 'http.server' && span.is_segment && span.attributes['url.path']?.value === path;
}

export function collectRequestSpans(path: string): Promise<SerializedStreamedSpan[]> {
  return collectStreamedSpans('deno', spans => spans.some(isSegmentFor(path)));
}

export function isRedisCommand(span: SerializedStreamedSpan): boolean {
  return getSpanOp(span) === 'db.query';
}

// `db.query.text` carries the key, so with span streaming a redis command span is named
// `{db.operation.name} {server.address}:{server.port}` instead.
export function expectedCommandName(span: SerializedStreamedSpan): string {
  const { 'db.operation.name': operation, 'server.address': address, 'server.port': port } = span.attributes;
  return `${operation?.value} ${address?.value}:${port?.value}`;
}
