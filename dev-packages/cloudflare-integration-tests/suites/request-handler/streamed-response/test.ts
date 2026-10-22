import { expect, it } from 'vitest';
import { createRunner } from '../../../runner';
import { getSpanOp } from '../../../spanUtils';

it.for([
  { body: 'stream', contentType: 'text/html;charset=utf-8' },
  { body: 'stream', contentType: 'text/x-component;charset=utf-8' },
  { body: 'string', contentType: 'text/html;charset=utf-8' },
  { body: 'string', contentType: 'text/x-component;charset=utf-8' },
  { body: 'string-with-content-length', contentType: 'text/html;charset=utf-8' },
  { body: 'string-with-content-length', contentType: 'text/x-component;charset=utf-8' },
])(
  'nests the render span in the http.server span for a $contentType response with a $body body',
  async ({ body, contentType }, { signal }) => {
    const runner = createRunner(__dirname).start(signal);

    const spansPromise = runner.collectStreamedSpans(
      spansOfTrace => spansOfTrace.some(span => span.is_segment) && spansOfTrace.some(span => span.name === 'render'),
    );

    const responseBody = await runner.makeRequest<string>(
      'get',
      `/?body=${body}&content-type=${encodeURIComponent(contentType)}`,
    );
    expect(responseBody).toBe('<div>shell</div><div>suspended</div>');

    const spans = await spansPromise;
    const segmentSpan = spans.find(span => span.is_segment);
    const renderSpan = spans.find(span => span.name === 'render');

    expect(getSpanOp(segmentSpan!)).toBe('http.server');
    expect(renderSpan?.parent_span_id).toBe(segmentSpan?.span_id);
    expect(segmentSpan!.end_timestamp).toBeGreaterThanOrEqual(renderSpan!.end_timestamp);
  },
);
