import { createRunner } from '../../../utils/runner';

// A general note regarding this test:
// The fact that the trace_id and span_id are correctly linked is tested in a unit test

describe('span links', () => {
  test('should link spans with addLink()', done => {
    createRunner(__dirname, 'scenario-addLink.ts')
      .expect({
        transaction: {
          transaction: 'parent1',
          spans: [
            expect.objectContaining({
              description: 'child1.1',
              links: [
                expect.objectContaining({
                  trace_id: expect.any(String),
                  span_id: expect.any(String),
                  attributes: expect.objectContaining({
                    'sentry.link.type': 'previous_trace',
                  }),
                }),
              ],
            }),
            expect.objectContaining({
              description: 'child1.2',
              links: [
                expect.objectContaining({
                  trace_id: expect.any(String),
                  span_id: expect.any(String),
                  attributes: expect.objectContaining({
                    'sentry.link.type': 'previous_trace',
                  }),
                }),
              ],
            }),
          ],
        },
      })
      .start(done);
  });

  test('should link spans with addLinks()', done => {
    createRunner(__dirname, 'scenario-addLinks.ts')
      .expect({
        transaction: {
          transaction: 'parent1',
          spans: [
            expect.objectContaining({
              description: 'child1.1',
              links: [],
            }),
            expect.objectContaining({
              description: 'child2.1',
              links: [
                expect.not.objectContaining({ attributes: expect.anything() }) &&
                  expect.objectContaining({
                    trace_id: expect.any(String),
                    span_id: expect.any(String),
                  }),
                expect.objectContaining({
                  trace_id: expect.any(String),
                  span_id: expect.any(String),
                  attributes: expect.objectContaining({
                    'sentry.link.type': 'previous_trace',
                  }),
                }),
              ],
            }),
          ],
        },
      })
      .start(done);
  });
});
