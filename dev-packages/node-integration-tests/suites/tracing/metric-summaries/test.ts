import { createRunner } from '../../../utils/runner';

const EXPECTED_TRANSACTION = {
  transaction: 'Test Transaction',
  spans: expect.arrayContaining([
    expect.objectContaining({
      description: 'Some other span',
      op: 'transaction',
      _metrics_summary: {
        'c:root-counter@undefined': {
          min: 1,
          max: 2,
          count: 3,
          sum: 4,
          tags: {
            release: '1.0',
            transaction: 'Test Transaction',
          },
        },
      },
    }),
  ]),
};

test('Should add metric summaries to spans', done => {
  createRunner(__dirname, 'scenario.js').expect({ transaction: EXPECTED_TRANSACTION }).start(done);
});
