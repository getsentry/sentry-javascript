import type { AttributeValue } from '@opentelemetry/api';
import { SpanStatusCode } from '@opentelemetry/api';
import { GraphQLInstrumentation } from '@opentelemetry/instrumentation-graphql';
import type { IntegrationFn } from '@sentry/core';
import { defineIntegration, getRootSpan, spanToJSON } from '@sentry/core';
import { addOriginToSpan, generateInstrumentOnce } from '@sentry/node-core';
import { SEMANTIC_ATTRIBUTE_SENTRY_GRAPHQL_OPERATION } from '@sentry/opentelemetry';

interface GraphqlOptions {
  /**
   * Do not create spans for resolvers.
   *
   * Defaults to true.
   */
  ignoreResolveSpans?: boolean;

  /**
   * Don't create spans for the execution of the default resolver on object properties.
   *
   * When a resolver function is not defined on the schema for a field, graphql will
   * use the default resolver which just looks for a property with that name on the object.
   * If the property is not a function, it's not very interesting to trace.
   * This option can reduce noise and number of spans created.
   *
   * Defaults to true.
   */
  ignoreTrivialResolveSpans?: boolean;

  /**
   * If this is enabled, a http.server root span containing this span will automatically be renamed to include the operation name.
   * Set this to `false` if you do not want this behavior, and want to keep the default http.server span name.
   *
   * Defaults to true.
   */
  useOperationNameForRootSpan?: boolean;
}

const INTEGRATION_NAME = 'Graphql';

export const instrumentGraphql = generateInstrumentOnce(
  INTEGRATION_NAME,
  GraphQLInstrumentation,
  (_options: GraphqlOptions) => {
    const options = getOptionsWithDefaults(_options);

    return {
      ...options,
      responseHook(span, result) {
        addOriginToSpan(span, 'auto.graphql.otel.graphql');

        // We want to ensure spans are marked as errored if there are errors in the result
        // We only do that if the span is not already marked with a status
        const resultWithMaybeError = result as { errors?: { message: string }[] };
        if (resultWithMaybeError.errors?.length && !spanToJSON(span).status) {
          span.setStatus({ code: SpanStatusCode.ERROR });
        }

        const attributes = spanToJSON(span).data;

        // If operation.name is not set, we fall back to use operation.type only
        const operationType = attributes['graphql.operation.type'];
        const operationName = attributes['graphql.operation.name'];

        if (options.useOperationNameForRootSpan && operationType) {
          const rootSpan = getRootSpan(span);
          const rootSpanAttributes = spanToJSON(rootSpan).data;

          const existingOperations = rootSpanAttributes[SEMANTIC_ATTRIBUTE_SENTRY_GRAPHQL_OPERATION] || [];

          const newOperation = operationName ? `${operationType} ${operationName}` : `${operationType}`;

          // We keep track of each operation on the root span
          // This can either be a string, or an array of strings (if there are multiple operations)
          if (Array.isArray(existingOperations)) {
            (existingOperations as string[]).push(newOperation);
            rootSpan.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_GRAPHQL_OPERATION, existingOperations);
          } else if (typeof existingOperations === 'string') {
            rootSpan.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_GRAPHQL_OPERATION, [existingOperations, newOperation]);
          } else {
            rootSpan.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_GRAPHQL_OPERATION, newOperation);
          }

          if (!spanToJSON(rootSpan).data['original-description']) {
            rootSpan.setAttribute('original-description', spanToJSON(rootSpan).description);
          }
          // Important for e.g. @sentry/aws-serverless because this would otherwise overwrite the name again
          rootSpan.updateName(
            `${spanToJSON(rootSpan).data['original-description']} (${getGraphqlOperationNamesFromAttribute(
              existingOperations,
            )})`,
          );
        }
      },
    };
  },
);

const _graphqlIntegration = ((options: GraphqlOptions = {}) => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      // We set defaults here, too, because otherwise we'd update the instrumentation config
      // to the config without defaults, as `generateInstrumentOnce` automatically calls `setConfig(options)`
      // when being called the second time
      instrumentGraphql(getOptionsWithDefaults(options));
    },
  };
}) satisfies IntegrationFn;

/**
 * Adds Sentry tracing instrumentation for the [graphql](https://www.npmjs.com/package/graphql) library.
 *
 * For more information, see the [`graphqlIntegration` documentation](https://docs.sentry.io/platforms/javascript/guides/node/configuration/integrations/graphql/).
 *
 * @param {GraphqlOptions} options Configuration options for the GraphQL integration.
 *
 * @example
 * ```javascript
 * const Sentry = require('@sentry/node');
 *
 * Sentry.init({
 *  integrations: [Sentry.graphqlIntegration()],
 * });
 */
export const graphqlIntegration = defineIntegration(_graphqlIntegration);

function getOptionsWithDefaults(options?: GraphqlOptions): GraphqlOptions {
  return {
    ignoreResolveSpans: true,
    ignoreTrivialResolveSpans: true,
    useOperationNameForRootSpan: true,
    ...options,
  };
}

// copy from packages/opentelemetry/utils
function getGraphqlOperationNamesFromAttribute(attr: AttributeValue): string {
  if (Array.isArray(attr)) {
    const sorted = attr.slice().sort();

    // Up to 5 items, we just add all of them
    if (sorted.length <= 5) {
      return sorted.join(', ');
    } else {
      // Else, we add the first 5 and the diff of other operations
      return `${sorted.slice(0, 5).join(', ')}, +${sorted.length - 5}`;
    }
  }

  return `${attr}`;
}
