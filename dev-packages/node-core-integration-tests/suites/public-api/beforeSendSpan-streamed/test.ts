import { expect, test } from 'vitest';
import { createRunner } from '../../../utils/runner';

test('beforeSendSpan applies changes to streamed span', async () => {
  await createRunner(__dirname, 'scenario.ts')
    .expect({
      span: container => {
        const spans = container.items;
        expect(spans.length).toBe(2);

        const customChildSpan = spans.find(s => s.name === 'customChildSpanName');

        expect(customChildSpan).toBeDefined();
        expect(customChildSpan!.attributes?.['sentry.custom_attribute']).toEqual({
          type: 'string',
          value: 'customAttributeValue',
        });
        expect(customChildSpan!.status).toBe('something');
        expect(customChildSpan!.links).toEqual([
          {
            trace_id: '123',
            span_id: '456',
            attributes: {
              'sentry.link.type': { type: 'string', value: 'custom_link' },
            },
          },
        ]);
      },
    })
    .start()
    .completed();
});
