/**
 * @vitest-environment jsdom
 */

import type { FetchHint, XhrHint } from '@sentry-internal/browser-utils';
import { SENTRY_XHR_DATA_KEY } from '@sentry-internal/browser-utils';
import { describe, expect, test } from 'vitest';
import {
  _getGraphQLOperation,
  getGraphQLRequestPayload,
  getRequestPayloadXhrOrFetch,
  parseGraphQLQuery,
} from '../../src/integrations/graphqlClient';

describe('GraphqlClient', () => {
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

    const queryFour = `query  {
      items {
          id
          }
      }`;

    test.each([
      ['should handle query type', queryOne, { operationName: 'Test', operationType: 'query' }],
      ['should handle mutation type', queryTwo, { operationName: 'AddTestItem', operationType: 'mutation' }],
      [
        'should handle subscription type',
        queryThree,
        { operationName: 'OnTestItemAdded', operationType: 'subscription' },
      ],
      ['should handle query without name', queryFour, { operationName: undefined, operationType: 'query' }],
    ])('%s', (_, input, output) => {
      expect(parseGraphQLQuery(input)).toEqual(output);
    });
  });

  describe('getGraphQLRequestPayload', () => {
    test('should return undefined for non-GraphQL request', () => {
      const requestBody = { data: [1, 2, 3] };

      expect(getGraphQLRequestPayload(JSON.stringify(requestBody))).toBeUndefined();
    });

    test('should return the payload object for standard GraphQL request', () => {
      const requestBody = {
        query: 'query Test {\r\n  items {\r\n    id\r\n   }\r\n }',
        operationName: 'Test',
        variables: {},
        extensions: {},
      };

      expect(getGraphQLRequestPayload(JSON.stringify(requestBody))).toEqual(requestBody);
    });

    test('should return the payload object for persisted operation request', () => {
      const requestBody = {
        operationName: 'GetUser',
        variables: { id: '123' },
        extensions: {
          persistedQuery: {
            version: 1,
            sha256Hash: 'abc123def456...',
          },
        },
      };

      expect(getGraphQLRequestPayload(JSON.stringify(requestBody))).toEqual(requestBody);
    });

    test('should return undefined for persisted operation without operationName', () => {
      const requestBody = {
        variables: { id: '123' },
        extensions: {
          persistedQuery: {
            version: 1,
            sha256Hash: 'abc123def456...',
          },
        },
      };

      expect(getGraphQLRequestPayload(JSON.stringify(requestBody))).toBeUndefined();
    });

    test('should return undefined for request with extensions but no persistedQuery', () => {
      const requestBody = {
        operationName: 'GetUser',
        variables: { id: '123' },
        extensions: {
          someOtherExtension: true,
        },
      };

      expect(getGraphQLRequestPayload(JSON.stringify(requestBody))).toBeUndefined();
    });

    test('should return undefined for persisted operation with incomplete persistedQuery object', () => {
      const requestBody = {
        operationName: 'GetUser',
        variables: { id: '123' },
        extensions: {
          persistedQuery: {},
        },
      };

      expect(getGraphQLRequestPayload(JSON.stringify(requestBody))).toBeUndefined();
    });

    test('should return undefined for persisted operation missing sha256Hash', () => {
      const requestBody = {
        operationName: 'GetUser',
        extensions: {
          persistedQuery: {
            version: 1,
          },
        },
      };

      expect(getGraphQLRequestPayload(JSON.stringify(requestBody))).toBeUndefined();
    });

    test('should return undefined for persisted operation missing version', () => {
      const requestBody = {
        operationName: 'GetUser',
        extensions: {
          persistedQuery: {
            sha256Hash: 'abc123',
          },
        },
      };

      expect(getGraphQLRequestPayload(JSON.stringify(requestBody))).toBeUndefined();
    });

    test('should return undefined for invalid JSON', () => {
      expect(getGraphQLRequestPayload('not valid json {')).toBeUndefined();
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

  describe('_getGraphQLOperation', () => {
    test('should format standard GraphQL query with operation name', () => {
      const requestBody = {
        query: 'query GetUser { user { id } }',
        operationName: 'GetUser',
      };

      expect(_getGraphQLOperation(requestBody)).toBe('query GetUser');
    });

    test('should format standard GraphQL mutation with operation name', () => {
      const requestBody = {
        query: 'mutation CreateUser($input: UserInput!) { createUser(input: $input) { id } }',
        operationName: 'CreateUser',
      };

      expect(_getGraphQLOperation(requestBody)).toBe('mutation CreateUser');
    });

    test('should format standard GraphQL subscription with operation name', () => {
      const requestBody = {
        query: 'subscription OnUserCreated { userCreated { id } }',
        operationName: 'OnUserCreated',
      };

      expect(_getGraphQLOperation(requestBody)).toBe('subscription OnUserCreated');
    });

    test('should format standard GraphQL query without operation name', () => {
      const requestBody = {
        query: 'query { users { id } }',
      };

      expect(_getGraphQLOperation(requestBody)).toBe('query');
    });

    test('should use query operation name when provided in request body', () => {
      const requestBody = {
        query: 'query { users { id } }',
        operationName: 'GetAllUsers',
      };

      expect(_getGraphQLOperation(requestBody)).toBe('query GetAllUsers');
    });

    test('should format persisted operation request', () => {
      const requestBody = {
        operationName: 'GetUser',
        variables: { id: '123' },
        extensions: {
          persistedQuery: {
            version: 1,
            sha256Hash: 'abc123def456',
          },
        },
      };

      expect(_getGraphQLOperation(requestBody)).toBe('persisted GetUser');
    });

    test('should handle persisted operation with additional extensions', () => {
      const requestBody = {
        operationName: 'GetUser',
        extensions: {
          persistedQuery: {
            version: 1,
            sha256Hash: 'abc123def456',
          },
          tracing: true,
          customExtension: 'value',
        },
      };

      expect(_getGraphQLOperation(requestBody)).toBe('persisted GetUser');
    });

    test('should return "unknown" for unrecognized request format', () => {
      const requestBody = {
        variables: { id: '123' },
      };

      // This shouldn't happen in practice since getGraphQLRequestPayload filters,
      // but test the fallback behavior
      expect(_getGraphQLOperation(requestBody as any)).toBe('unknown');
    });
  });
});
