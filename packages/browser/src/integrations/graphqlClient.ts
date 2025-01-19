import { SENTRY_XHR_DATA_KEY } from '@sentry-internal/browser-utils';
import { getBodyString } from '@sentry-internal/replay';
import type { FetchHint, XhrHint } from '@sentry-internal/replay';
import {
  SEMANTIC_ATTRIBUTE_HTTP_REQUEST_METHOD,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_URL_FULL,
  defineIntegration,
  spanToJSON,
} from '@sentry/core';
import type { Client, IntegrationFn } from '@sentry/types';
import { isString, stringMatchesSomePattern } from '@sentry/utils';

interface GraphQLClientOptions {
  endpoints: Array<string | RegExp>;
}

// Standard graphql request shape: https://graphql.org/learn/serving-over-http/#post-request-and-body
interface GraphQLRequestPayload {
  query: string;
  operationName?: string;
  variables?: Record<string, unknown>;
  extensions?: Record<string, unknown>;
}

interface GraphQLOperation {
  operationType: string | undefined;
  operationName: string | undefined;
}

const INTEGRATION_NAME = 'GraphQLClient';

const _graphqlClientIntegration = ((options: GraphQLClientOptions) => {
  return {
    name: INTEGRATION_NAME,
    setup(client) {
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
    const payload = _getRequestPayloadXhrOrFetch(hint);

    if (isTracedGraphqlEndpoint && payload) {
      const graphqlBody = getGraphQLRequestPayload(payload) as GraphQLRequestPayload;
      const operationInfo = _getGraphQLOperation(graphqlBody);

      span.updateName(`${httpMethod} ${httpUrl} (${operationInfo})`);
      span.setAttribute('graphql.document', payload);
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
      const httpUrl = data && data.url;
      const { endpoints } = options;

      const isTracedGraphqlEndpoint = stringMatchesSomePattern(httpUrl, endpoints);
      const payload = _getRequestPayloadXhrOrFetch(handlerData);

      if (isTracedGraphqlEndpoint && data && payload) {
        const graphqlBody = getGraphQLRequestPayload(payload);

        if (!data.graphql && graphqlBody) {
          const operationInfo = _getGraphQLOperation(graphqlBody as GraphQLRequestPayload);
          data['graphql.document'] = (graphqlBody as GraphQLRequestPayload).query;
          data['graphql.operation'] = operationInfo;
        }
      }
    }
  });
}

/**
 * @param requestBody - GraphQL request
 * @returns A formatted version of the request: 'TYPE NAME' or 'TYPE'
 */
function _getGraphQLOperation(requestBody: GraphQLRequestPayload): string {
  const { query: graphqlQuery, operationName: graphqlOperationName } = requestBody;

  const { operationName = graphqlOperationName, operationType } = parseGraphQLQuery(graphqlQuery);
  const operationInfo = operationName ? `${operationType} ${operationName}` : `${operationType}`;

  return operationInfo;
}

/**
 * Get the request body/payload based on the shape of the hint
 * TODO: export for test?
 */
function _getRequestPayloadXhrOrFetch(hint: XhrHint | FetchHint): string | undefined {
  const isXhr = 'xhr' in hint;
  const isFetch = !isXhr;

  let body: string | undefined;

  if (isXhr) {
    const sentryXhrData = hint.xhr[SENTRY_XHR_DATA_KEY];
    body = sentryXhrData && getBodyString(sentryXhrData.body)[0];
  } else if (isFetch) {
    const sentryFetchData = parseFetchPayload(hint.input);
    body = getBodyString(sentryFetchData)[0];
  }

  return body;
}

// Duplicate from deprecated @sentry-utils/src/instrument/fetch.ts
function hasProp<T extends string>(obj: unknown, prop: T): obj is Record<string, string> {
  return !!obj && typeof obj === 'object' && !!(obj as Record<string, string>)[prop];
}

/**
 * Parses the fetch arguments to extract the request payload.
 * Exported for tests only.
 */
export function parseFetchPayload(fetchArgs: unknown[]): string | undefined {
  if (fetchArgs.length === 2) {
    const options = fetchArgs[1];
    return hasProp(options, 'body') ? String(options.body) : undefined;
  }

  const arg = fetchArgs[0];
  return hasProp(arg, 'body') ? String(arg.body) : undefined;
}

/**
 * Extract the name and type of the operation from the GraphQL query.
 * Exported for tests only.
 * @param query
 */
export function parseGraphQLQuery(query: string): GraphQLOperation {
  const queryRe = /^(?:\s*)(query|mutation|subscription)(?:\s*)(\w+)(?:\s*)[{(]/;

  const matched = query.match(queryRe);

  if (matched) {
    return {
      operationType: matched[1],
      operationName: matched[2],
    };
  }
  return {
    operationType: undefined,
    operationName: undefined,
  };
}

/**
 * Extract the payload of a request if it's GraphQL.
 * Exported for tests only.
 * @param payload - A valid JSON string
 * @returns A POJO or undefined
 */
export function getGraphQLRequestPayload(payload: string): unknown | undefined {
  let graphqlBody = undefined;
  try {
    const requestBody = JSON.parse(payload);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const isGraphQLRequest = !!requestBody['query'];

    if (isGraphQLRequest) {
      graphqlBody = requestBody;
    }
  } finally {
    // Fallback to undefined if payload is an invalid JSON (SyntaxError)

    /* eslint-disable no-unsafe-finally */
    return graphqlBody;
  }
}

/**
 * GraphQL Client integration for the browser.
 */
export const graphqlClientIntegration = defineIntegration(_graphqlClientIntegration);
