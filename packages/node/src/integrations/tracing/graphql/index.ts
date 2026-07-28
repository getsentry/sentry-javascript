import { GraphQLInstrumentation } from './vendored/instrumentation';
import { generateInstrumentOnce } from '../../../otel/instrument';

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

const INTEGRATION_NAME = 'Graphql' as const;

export const instrumentGraphql = generateInstrumentOnce(
  INTEGRATION_NAME,
  GraphQLInstrumentation,
  (_options: GraphqlOptions) => getOptionsWithDefaults(_options),
);

function getOptionsWithDefaults(options?: GraphqlOptions): GraphqlOptions {
  return {
    ignoreResolveSpans: true,
    ignoreTrivialResolveSpans: true,
    useOperationNameForRootSpan: true,
    ...options,
  };
}
