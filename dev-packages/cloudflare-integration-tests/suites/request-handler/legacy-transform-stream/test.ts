import { expect, it } from 'vitest';
import { createRunner } from '../../../runner';
import { getSpanOp, getSpansFromEnvelope } from '../../../spanUtils';

it.for(['text/html;charset=utf-8', 'text/event-stream'])(
  'sends the http.server span of a streamed %s response when TransformStream ignores the transformer',
  async (contentType, { signal }) => {
    const runner = createRunner(__dirname)
      .expect(envelope => {
        const segmentSpan = getSpansFromEnvelope(envelope).find(span => span.is_segment);
        expect(getSpanOp(segmentSpan!)).toBe('http.server');
      })
      .start(signal);

    const body = await runner.makeRequest<string>('get', `/?content-type=${encodeURIComponent(contentType)}`);
    expect(body).toBe('<div>shell</div>');

    await runner.completed();
  },
);
