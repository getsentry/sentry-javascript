import type { Client, Event } from '@sentry/types';
import { Transaction } from '../src/transaction';

// eslint-disable-next-line deprecation/deprecation
const transaction = new Transaction();

describe('Transaction', () => {
  describe('extracts info from module/function of the first `in_app` frame', () => {
    it('using module only', () => {
      const event = transaction.processEvent!(
        {
          exception: {
            values: [
              {
                stacktrace: {
                  frames: [
                    {
                      filename: '/some/file1.js',
                      in_app: false,
                      module: 'Foo',
                    },
                    {
                      filename: '/some/file2.js',
                      in_app: true,
                      module: 'Qux',
                    },
                  ],
                },
              },
            ],
          },
        },
        {},
        {} as Client,
      ) as Event;
      expect(event.transaction).toEqual('Qux/?');
    });

    it('using function only', () => {
      const event = transaction.processEvent!(
        {
          exception: {
            values: [
              {
                stacktrace: {
                  frames: [
                    {
                      filename: '/some/file1.js',
                      function: 'Bar',
                      in_app: false,
                    },
                    {
                      filename: '/some/file2.js',
                      function: 'Baz',
                      in_app: true,
                    },
                  ],
                },
              },
            ],
          },
        },
        {},
        {} as Client,
      ) as Event;
      expect(event.transaction).toEqual('?/Baz');
    });

    it('using module and function', () => {
      const event = transaction.processEvent!(
        {
          exception: {
            values: [
              {
                stacktrace: {
                  frames: [
                    {
                      filename: '/some/file1.js',
                      function: 'Bar',
                      in_app: true,
                      module: 'Foo',
                    },
                    {
                      filename: '/some/file2.js',
                      function: 'Baz',
                      in_app: false,
                      module: 'Qux',
                    },
                  ],
                },
              },
            ],
          },
        },
        {},
        {} as Client,
      ) as Event;
      expect(event.transaction).toEqual('Foo/Bar');
    });

    it('using default', () => {
      const event = transaction.processEvent!(
        {
          exception: {
            values: [
              {
                stacktrace: {
                  frames: [
                    {
                      filename: '/some/file1.js',
                      in_app: false,
                    },
                    {
                      filename: '/some/file2.js',
                      in_app: true,
                    },
                  ],
                },
              },
            ],
          },
        },
        {},
        {} as Client,
      ) as Event;
      expect(event.transaction).toEqual('<unknown>');
    });

    it('no value with no `in_app` frame', () => {
      const event = transaction.processEvent!(
        {
          exception: {
            values: [
              {
                stacktrace: {
                  frames: [
                    {
                      filename: '/some/file1.js',
                      in_app: false,
                    },
                    {
                      filename: '/some/file2.js',
                      in_app: false,
                    },
                  ],
                },
              },
            ],
          },
        },
        {},
        {} as Client,
      ) as Event;
      expect(event.transaction).toBeUndefined();
    });
  });
});
