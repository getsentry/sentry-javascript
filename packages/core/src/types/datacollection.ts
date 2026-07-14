/**
 * Controls how key-value data (headers, cookies, query params) is collected and filtered.
 *
 * - `true`: Collect all data without filtering (empty denylist). Sensitive values like keys and tokens are always filtered out.
 * - `false`: Do not collect any data.
 * - `{ allow: string[] }`: Collect only the specified keys.
 * - `{ deny: string[] }`: Collect all keys except the specified ones.
 */
export type CollectBehavior = boolean | { allow: string[] } | { deny: string[] };

export type HttpBodyCollectionTarget = 'incomingRequest' | 'outgoingRequest' | 'incomingResponse' | 'outgoingResponse';

/**
 * Controls what data the SDK collects and sends to Sentry.
 *
 * All fields are optional. Omitted fields use the documented defaults.
 */
export interface DataCollection {
  /**
   * Automatically populate `user.*` fields from instrumentation sources.
   * @default false
   */
  userInfo?: boolean;

  /**
   * Controls cookie collection and sensitive value filtering.
   * @default true
   */
  cookies?: CollectBehavior;

  /**
   * Controls HTTP header collection for requests and responses.
   * @default { request: true, response: true }
   */
  httpHeaders?: {
    request?: CollectBehavior;
    response?: CollectBehavior;
  };

  /**
   * Which HTTP body types to collect. An omitted value collects all body types valid for the
   * platform; an empty array (`[]`) disables body collection.
   * @default ['incomingRequest', 'outgoingRequest', 'incomingResponse', 'outgoingResponse']
   */
  httpBodies?: HttpBodyCollectionTarget[];

  /**
   * Controls query parameter collection and sensitive value filtering.
   * @default true
   */
  queryParams?: CollectBehavior;

  /**
   * Allow collection of GraphQL operation data when using the SDK's GraphQL integrations
   *
   * These options do not add GraphQL instrumentation on their own. The corresponding integration must still be enabled
   * for any data to be captured.
   *
   * - `document`: attach the GraphQL document (query/mutation source text).
   * - `variables`: attach the variables passed to GraphQL operations.
   * @default { document: true, variables: true }
   */
  graphQL?: {
    document?: boolean;
    variables?: boolean;
  };

  /**
   * Allow generative AI input/output recording when using the SDK's AI integrations.
   *
   * These options do not add AI instrumentation on their own. The corresponding integration must still be enabled for
   * any data to be captured. Integration-level options, when set, take precedence over these
   * values.
   * @default { inputs: true, outputs: true }
   */
  genAI?: {
    inputs?: boolean;
    outputs?: boolean;
  };

  /**
   * Include data associated with database queries, such as parameters provided to a query, statement values, or returned results.
   * Structural metadata (database system, query summary, table) is always collected regardless of this setting.
   * @default true
   */
  databaseQueryData?: boolean;

  /**
   * Capture local variable values in stack frames.
   * @default true
   */
  stackFrameVariables?: boolean;

  /**
   * Number of source code context lines to capture around stack frames.
   * @default 5
   */
  frameContextLines?: number;
}

/**
 * Fully resolved `DataCollection` with all defaults applied.
 */
export type ResolvedDataCollection = Required<DataCollection> & {
  httpHeaders: Required<NonNullable<DataCollection['httpHeaders']>>;
  graphQL: Required<NonNullable<DataCollection['graphQL']>>;
  genAI: Required<NonNullable<DataCollection['genAI']>>;
};
