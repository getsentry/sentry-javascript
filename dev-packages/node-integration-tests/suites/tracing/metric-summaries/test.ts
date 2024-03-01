import { createRunner } from '../../../utils/runner';

const EXPECTED_TRANSACTION = {
  transaction: 'Test Transaction',
  _metrics_summary: {
    'c:root-counter@none': [
      {
        min: 1,
        max: 1,
        count: 1,
        sum: 1,
        tags: {
          release: '1.0',
          email: 'jon.doe@example.com',
        },
        transaction: 'Test Transaction',
      },
      {
        min: 1,
        max: 1,
        count: 1,
        sum: 1,
        tags: {
          release: '1.0',
          email: 'jane.doe@example.com',
        },
        transaction: 'Test Transaction',
      },
    ],
  },
  spans: expect.arrayContaining([
    expect.objectContaining({
      description: 'Some other span',
      op: 'transaction',
      _metrics_summary: {
        'c:root-counter@none': [
          {
            min: 1,
            max: 2,
            count: 3,
            sum: 4,
            tags: {
              release: '1.0',
            },
          },
        ],
        's:root-set@none': [
          {
            min: 0,
            max: 1,
            count: 3,
            sum: 2,
            tags: {
              release: '1.0',
            },
          },
        ],
        'g:root-gauge@none': [
          {
            min: 20,
            max: 42,
            count: 2,
            sum: 62,
            tags: {
              release: '1.0',
            },
          },
        ],
        'd:root-distribution@none': [
          {
            min: 20,
            max: 42,
            count: 2,
            sum: 62,
            tags: {
              release: '1.0',
            },
          },
        ],
      },
    }),
  ]),
};

test('Should add metric summaries to spans', done => {
  createRunner(__dirname, 'scenario.js').expect({ transaction: EXPECTED_TRANSACTION }).start(done);
});
