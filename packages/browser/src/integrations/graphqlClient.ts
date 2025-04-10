import { SENTRY_XHR_DATA_KEY, getBodyString, getFetchRequestArgBody } from '@sentry-internal/browser-utils';
import type { FetchHint, XhrHint } from '@sentry-internal/browser-utils';
import {
  SEMANTIC_ATTRIBUTE_HTTP_REQUEST_METHOD,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_URL_FULL,
  defineIntegration,
  isString,
  spanToJSON,
  stringMatchesSomePattern,
} from '@sentry/core';
import type { Client, IntegrationFn } from '@sentry/core';

interface GraphQLClientOptions {
  endpoints: Array<string | RegExp>;
}

/** Standard graphql request shape: https://graphql.org/learn/serving-over-http/#post-request-and-body */
interface GraphQLRequestPayload {
  query: string;
  operationName?: string;
  variables?: Record<string, unknown>;
  extensions?: Record<string, unknown>;
}

interface GraphQLOperation {
  operationType?: string;
  operationName?: string;
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
    const payload = getRequestPayloadXhrOrFetch(hint as XhrHint | FetchHint);

    if (isTracedGraphqlEndpoint && payload) {
      const graphqlBody = getGraphQLRequestPayload(payload);

      if (graphqlBody) {
        const operationInfo = _getGraphQLOperation(graphqlBody);
        span.updateName(`${httpMethod} ${httpUrl} (${operationInfo})`);
        span.setAttribute('graphql.document', payload);
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
          data['graphql.document'] = graphqlBody.query;
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
 * Extract the payload of a request if it's GraphQL.
 * Exported for tests only.
 * @param payload - A valid JSON string
 * @returns A POJO or undefined
 */
export function getGraphQLRequestPayload(payload: string): GraphQLRequestPayload | undefined {
  let graphqlBody = undefined;
  try {
    const requestBody = JSON.parse(payload) satisfies GraphQLRequestPayload;

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
 * This integration ensures that GraphQL requests made in the browser
 * have their GraphQL-specific data captured and attached to spans and breadcrumbs.
 */
export const graphqlClientIntegration = defineIntegration(_graphqlClientIntegration);
