import type { Client, IntegrationFn } from '@sentry/core';
import {
  defineIntegration,
  isString,
  SEMANTIC_ATTRIBUTE_HTTP_REQUEST_METHOD,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_URL_FULL,
  spanToJSON,
  stringMatchesSomePattern,
} from '@sentry/core';
import type { FetchHint, XhrHint } from '@sentry-internal/browser-utils';
import { getBodyString, getFetchRequestArgBody, SENTRY_XHR_DATA_KEY } from '@sentry-internal/browser-utils';

interface GraphQLClientOptions {
  endpoints: Array<string | RegExp>;
}

/** Standard graphql request shape: https://graphql.org/learn/serving-over-http/#post-request-and-body */
interface GraphQLStandardRequest {
  query: string;
  operationName?: string;
  variables?: Record<string, unknown>;
  extensions?: Record<string, unknown>;
}

/** Persisted operation request */
interface GraphQLPersistedRequest {
  operationName: string;
  variables?: Record<string, unknown>;
  extensions: {
    persistedQuery: {
      version: number;
      sha256Hash: string;
    };
  } & Record<string, unknown>;
}

type GraphQLRequestPayload = GraphQLStandardRequest | GraphQLPersistedRequest;

interface GraphQLOperation {
  operationType?: string;
  operationName?: string;
}

const INTEGRATION_NAME = 'GraphQLClient';

const _graphqlClientIntegration = ((options: GraphQLClientOptions) => {
  return {
    name: INTEGRATION_NAME,
    setup(client: Client) {
      _updateSpanWithGraphQLData(client, options);
      _updateBreadcrumbWithGraphQLData(client, options);
    },
  };
}) satisfies IntegrationFn;

function _updateSpanWithGraphQLData(client: Client, options: GraphQLClientOptions): void {
  client.on('beforeOutgoingRequestSpan', (span, hint) => {
    const spanJSON = spanToJSON(span);

    const spanAttributes = spanJSON.data || {};
    const spanOp = spanAttributes[SEMANTIC_ATTRIBUTE_SENTRY_OP];

    const isHttpClientSpan = spanOp === 'http.client';

    if (!isHttpClientSpan) {
      return;
    }

    const httpUrl = spanAttributes[SEMANTIC_ATTRIBUTE_URL_FULL] || spanAttributes['http.url'];
    const httpMethod = spanAttributes[SEMANTIC_ATTRIBUTE_HTTP_REQUEST_METHOD] || spanAttributes['http.method'];

    if (!isString(httpUrl) || !isString(httpMethod)) {
      return;
    }

    const { endpoints } = options;
    const isTracedGraphqlEndpoint = stringMatchesSomePattern(httpUrl, endpoints);
    const payload = getRequestPayloadXhrOrFetch(hint as XhrHint | FetchHint);

    if (isTracedGraphqlEndpoint && payload) {
      const graphqlBody = getGraphQLRequestPayload(payload);

      if (graphqlBody) {
        const operationInfo = _getGraphQLOperation(graphqlBody);
        span.updateName(`${httpMethod} ${httpUrl} (${operationInfo})`);

        // Handle standard requests - always capture the query document
        if (isStandardRequest(graphqlBody)) {
          span.setAttribute('graphql.document', graphqlBody.query);
        }

        // Handle persisted operations - capture hash for debugging
        if (isPersistedRequest(graphqlBody)) {
          span.setAttribute('graphql.persisted_query.hash.sha256', graphqlBody.extensions.persistedQuery.sha256Hash);
          span.setAttribute('graphql.persisted_query.version', graphqlBody.extensions.persistedQuery.version);
        }
      }
    }
  });
}

function _updateBreadcrumbWithGraphQLData(client: Client, options: GraphQLClientOptions): void {
  client.on('beforeOutgoingRequestBreadcrumb', (breadcrumb, handlerData) => {
    const { category, type, data } = breadcrumb;

    const isFetch = category === 'fetch';
    const isXhr = category === 'xhr';
    const isHttpBreadcrumb = type === 'http';

    if (isHttpBreadcrumb && (isFetch || isXhr)) {
      const httpUrl = data?.url;
      const { endpoints } = options;

      const isTracedGraphqlEndpoint = stringMatchesSomePattern(httpUrl, endpoints);
      const payload = getRequestPayloadXhrOrFetch(handlerData as XhrHint | FetchHint);

      if (isTracedGraphqlEndpoint && data && payload) {
        const graphqlBody = getGraphQLRequestPayload(payload);

        if (!data.graphql && graphqlBody) {
          const operationInfo = _getGraphQLOperation(graphqlBody);

          data['graphql.operation'] = operationInfo;

          if (isStandardRequest(graphqlBody)) {
            data['graphql.document'] = graphqlBody.query;
          }

          if (isPersistedRequest(graphqlBody)) {
            data['graphql.persisted_query.hash.sha256'] = graphqlBody.extensions.persistedQuery.sha256Hash;
            data['graphql.persisted_query.version'] = graphqlBody.extensions.persistedQuery.version;
          }
        }
      }
    }
  });
}

/**
 * @param requestBody - GraphQL request
 * @returns A formatted version of the request: 'TYPE NAME' or 'TYPE' or 'persisted NAME'
 */
export function _getGraphQLOperation(requestBody: GraphQLRequestPayload): string {
  // Handle persisted operations
  if (isPersistedRequest(requestBody)) {
    return `persisted ${requestBody.operationName}`;
  }

  // Handle standard GraphQL requests
  if (isStandardRequest(requestBody)) {
    const { query: graphqlQuery, operationName: graphqlOperationName } = requestBody;
    const { operationName = graphqlOperationName, operationType } = parseGraphQLQuery(graphqlQuery);
    const operationInfo = operationName ? `${operationType} ${operationName}` : `${operationType}`;
    return operationInfo;
  }

  // Fallback for unknown request types
  return 'unknown';
}

/**
 * Get the request body/payload based on the shape of the hint.
 *
 * Exported for tests only.
 */
export function getRequestPayloadXhrOrFetch(hint: XhrHint | FetchHint): string | undefined {
  const isXhr = 'xhr' in hint;

  let body: string | undefined;

  if (isXhr) {
    const sentryXhrData = hint.xhr[SENTRY_XHR_DATA_KEY];
    body = sentryXhrData && getBodyString(sentryXhrData.body)[0];
  } else {
    const sentryFetchData = getFetchRequestArgBody(hint.input);
    body = getBodyString(sentryFetchData)[0];
  }

  return body;
}

/**
 * Extract the name and type of the operation from the GraphQL query.
 *
 * Exported for tests only.
 */
export function parseGraphQLQuery(query: string): GraphQLOperation {
  const namedQueryRe = /^(?:\s*)(query|mutation|subscription)(?:\s*)(\w+)(?:\s*)[{(]/;
  const unnamedQueryRe = /^(?:\s*)(query|mutation|subscription)(?:\s*)[{(]/;

  const namedMatch = query.match(namedQueryRe);
  if (namedMatch) {
    return {
      operationType: namedMatch[1],
      operationName: namedMatch[2],
    };
  }

  const unnamedMatch = query.match(unnamedQueryRe);
  if (unnamedMatch) {
    return {
      operationType: unnamedMatch[1],
      operationName: undefined,
    };
  }
  return {
    operationType: undefined,
    operationName: undefined,
  };
}

/**
 * Helper to safely check if a value is a non-null object
 */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Type guard to check if a request is a standard GraphQL request
 */
function isStandardRequest(payload: unknown): payload is GraphQLStandardRequest {
  return isObject(payload) && typeof payload.query === 'string';
}

/**
 * Type guard to check if a request is a persisted operation request
 */
function isPersistedRequest(payload: unknown): payload is GraphQLPersistedRequest {
  return (
    isObject(payload) &&
    typeof payload.operationName === 'string' &&
    isObject(payload.extensions) &&
    isObject(payload.extensions.persistedQuery) &&
    typeof payload.extensions.persistedQuery.sha256Hash === 'string' &&
    typeof payload.extensions.persistedQuery.version === 'number'
  );
}

/**
 * Extract the payload of a request if it's GraphQL.
 * Exported for tests only.
 * @param payload - A valid JSON string
 * @returns A POJO or undefined
 */
export function getGraphQLRequestPayload(payload: string): GraphQLRequestPayload | undefined {
  try {
    const requestBody = JSON.parse(payload);

    // Return any valid GraphQL request (standard, persisted, or APQ retry with both)
    if (isStandardRequest(requestBody) || isPersistedRequest(requestBody)) {
      return requestBody;
    }

    // Not a GraphQL request
    return undefined;
  } catch {
    // Invalid JSON
    return undefined;
  }
}

/**
 * This integration ensures that GraphQL requests made in the browser
 * have their GraphQL-specific data captured and attached to spans and breadcrumbs.
 */
export const graphqlClientIntegration = defineIntegration(_graphqlClientIntegration);
