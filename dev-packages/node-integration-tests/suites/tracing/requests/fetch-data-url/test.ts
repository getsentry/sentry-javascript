import { describe, expect } from 'vitest';
import { createEsmAndCjsTests } from '../../../../utils/runner';

describe('outgoing fetch to data URL', () => {
  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('data URL in fetch request should be sanitized in span', async () => {
      await createRunner()
        .expect({
          transaction: {
            transaction: 'test-span',
            spans: expect.arrayContaining([
              expect.objectContaining({
                description: 'GET <data:text/plain,base64>',
                op: 'http.client',
                data: expect.objectContaining({
                  url: '<data:text/plain,base64>',
                  'http.url': '<data:text/plain,base64>',
                }),
              }),
            ]),
          },
        })
        .start()
        .completed();
    });
  });
});
