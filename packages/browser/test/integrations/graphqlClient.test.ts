/**
 * @vitest-environment jsdom
 */

import { describe, expect, test } from 'vitest';

import { SENTRY_XHR_DATA_KEY } from '@sentry-internal/browser-utils';
import type { FetchHint, XhrHint } from '@sentry-internal/replay';
import {
  getGraphQLRequestPayload,
  getRequestPayloadXhrOrFetch,
  parseFetchPayload,
  parseGraphQLQuery,
} from '../../src/integrations/graphqlClient';

describe('GraphqlClient', () => {
  describe('parseFetchPayload', () => {
    const data = [1, 2, 3];
    const jsonData = '{"data":[1,2,3]}';

    test.each([
      ['string URL only', ['http://example.com'], undefined],
      ['URL object only', [new URL('http://example.com')], undefined],
      ['Request URL only', [{ url: 'http://example.com' }], undefined],
      [
        'Request URL & method only',
        [{ url: 'http://example.com', method: 'post', body: JSON.stringify({ data }) }],
        jsonData,
      ],
      ['string URL & options', ['http://example.com', { method: 'post', body: JSON.stringify({ data }) }], jsonData],
      [
        'URL object & options',
        [new URL('http://example.com'), { method: 'post', body: JSON.stringify({ data }) }],
        jsonData,
      ],
      [
        'Request URL & options',
        [{ url: 'http://example.com' }, { method: 'post', body: JSON.stringify({ data }) }],
        jsonData,
      ],
    ])('%s', (_name, args, expected) => {
      const actual = parseFetchPayload(args as unknown[]);

      expect(actual).toEqual(expected);
    });
  });

  describe('parseGraphQLQuery', () => {
    const queryOne = `query Test {
      items {
          id
          }
      }`;

    const queryTwo = `mutation AddTestItem($input: TestItem!) {
      addItem(input: $input) {
          name
          }
      }`;

    const queryThree = `subscription OnTestItemAdded($itemID: ID!) {
      itemAdded(itemID: $itemID) {
          id
          }
      }`;

    // TODO: support name-less queries
    //   const queryFour = `   query   {
    //     items {
    //         id
    //         }
    //     }`;

    test.each([
      ['should handle query type', queryOne, { operationName: 'Test', operationType: 'query' }],
      ['should handle mutation type', queryTwo, { operationName: 'AddTestItem', operationType: 'mutation' }],
      [
        'should handle subscription type',
        queryThree,
        { operationName: 'OnTestItemAdded', operationType: 'subscription' },
      ],
      // TODO: ['should handle query without name', queryFour, { operationName: undefined, operationType: 'query' }],
    ])('%s', (_, input, output) => {
      expect(parseGraphQLQuery(input)).toEqual(output);
    });
  });

  describe('getGraphQLRequestPayload', () => {
    test('should return undefined for non-GraphQL request', () => {
      const requestBody = { data: [1, 2, 3] };

      expect(getGraphQLRequestPayload(JSON.stringify(requestBody))).toBeUndefined();
    });
    test('should return the payload object for GraphQL request', () => {
      const requestBody = {
        query: 'query Test {\r\n  items {\r\n    id\r\n   }\r\n }',
        operationName: 'Test',
        variables: {},
      };

      expect(getGraphQLRequestPayload(JSON.stringify(requestBody))).toEqual(requestBody);
    });
  });

  describe('getRequestPayloadXhrOrFetch', () => {
    test('should parse xhr payload', () => {
      const hint: XhrHint = {
        xhr: {
          [SENTRY_XHR_DATA_KEY]: {
            method: 'POST',
            url: 'http://example.com/test',
            status_code: 200,
            body: JSON.stringify({ key: 'value' }),
            request_headers: {
              'Content-Type': 'application/json',
            },
          },
          ...new XMLHttpRequest(),
        },
        input: JSON.stringify({ key: 'value' }),
        startTimestamp: Date.now(),
        endTimestamp: Date.now() + 1000,
      };

      const result = getRequestPayloadXhrOrFetch(hint);
      expect(result).toEqual(JSON.stringify({ key: 'value' }));
    });
    test('should parse fetch payload', () => {
      const hint: FetchHint = {
        input: [
          'http://example.com/test',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ key: 'value' }),
          },
        ],
        response: new Response(JSON.stringify({ key: 'value' }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        }),
        startTimestamp: Date.now(),
        endTimestamp: Date.now() + 1000,
      };

      const result = getRequestPayloadXhrOrFetch(hint);
      expect(result).toEqual(JSON.stringify({ key: 'value' }));
    });
    test('should return undefined if no body is in the response', () => {
      const hint: FetchHint = {
        input: [
          'http://example.com/test',
          {
            method: 'GET',
          },
        ],
        response: new Response(null, {
          status: 200,
        }),
        startTimestamp: Date.now(),
        endTimestamp: Date.now() + 1000,
      };

      const result = getRequestPayloadXhrOrFetch(hint);
      expect(result).toBeUndefined();
    });
  });
});
