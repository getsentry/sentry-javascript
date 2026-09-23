/*
 * Structural (type-only) subset of the `graphql` package, inlined so neither this integration nor the
 * node OTel graphql instrumentation takes a runtime or type dependency on `graphql`. This is the single
 * source of truth for these types: `@sentry/node`'s vendored `graphql-types.ts` re-exports from here
 * (via `@sentry/server-utils/orchestrion`). Only members the instrumentations touch are declared.
 */

export type PromiseOrValue<T> = T | Promise<T>;
export type Maybe<T> = null | undefined | T;

export interface Location {
  start: number;
  end: number;
  startToken: Token;
  [key: string]: unknown;
}

export interface Token {
  kind: string;
  start: number;
  end: number;
  line: number;
  column: number;
  value: string;
  prev: Token | null;
  next: Token | null;
  [key: string]: unknown;
}

export interface Source {
  body: string;
  name: string;
  [key: string]: unknown;
}

export interface DocumentNode {
  kind: string;
  definitions: ReadonlyArray<DefinitionNode>;
  loc?: Location;
  [key: string]: unknown;
}

export interface DefinitionNode {
  kind: string;
  operation?: string;
  name?: { kind: string; value: string; loc?: Location };
  loc?: Location;
  [key: string]: unknown;
}

export interface OperationDefinitionNode extends DefinitionNode {
  operation: string;
  name?: { kind: string; value: string; loc?: Location };
}

export interface ParseOptions {
  noLocation?: boolean;
  [key: string]: unknown;
}

export interface ExecutionArgs {
  schema: GraphQLSchema;
  document: DocumentNode;
  rootValue?: unknown;
  contextValue?: unknown;
  variableValues?: Maybe<Record<string, unknown>>;
  operationName?: Maybe<string>;
  fieldResolver?: Maybe<GraphQLFieldResolver>;
  typeResolver?: Maybe<GraphQLTypeResolver>;
  [key: string]: unknown;
}

export interface ExecutionResult {
  errors?: ReadonlyArray<GraphQLError>;
  data?: Record<string, unknown> | null;
  [key: string]: unknown;
}

export interface GraphQLError {
  message: string;
  [key: string]: unknown;
}

export interface GraphQLSchema {
  getQueryType(): GraphQLObjectType | undefined | null;
  getMutationType(): GraphQLObjectType | undefined | null;
  [key: string]: unknown;
}

export interface GraphQLObjectType {
  name: string;
  getFields(): Record<string, GraphQLField | undefined>;
  [key: string]: unknown;
}

export interface GraphQLField {
  name: string;
  type: GraphQLOutputType;
  resolve?: GraphQLFieldResolver;
  [key: string]: unknown;
}

export type GraphQLOutputType = GraphQLNamedOutputType | GraphQLWrappingType;

interface GraphQLNamedOutputType {
  name?: string;
  [key: string]: unknown;
}

interface GraphQLWrappingType {
  ofType: GraphQLOutputType;
  [key: string]: unknown;
}

export interface GraphQLUnionType {
  name: string;
  getTypes(): ReadonlyArray<GraphQLObjectType>;
  [key: string]: unknown;
}

export type GraphQLType = GraphQLOutputType | GraphQLUnionType;

export type GraphQLFieldResolver<TSource = unknown, TContext = unknown, TArgs = unknown> = (
  source: TSource,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo,
) => unknown;

export type GraphQLTypeResolver<TSource = unknown, TContext = unknown> = (
  value: TSource,
  context: TContext,
  info: GraphQLResolveInfo,
  abstractType: unknown,
) => unknown;

export interface GraphQLResolveInfo {
  fieldName: string;
  fieldNodes: ReadonlyArray<{ kind: string; loc?: Location; [key: string]: unknown }>;
  returnType: { toString(): string; [key: string]: unknown };
  parentType: { name: string; [key: string]: unknown };
  path: GraphQLPath;
  [key: string]: unknown;
}

export interface GraphQLPath {
  prev: GraphQLPath | undefined;
  key: string | number;
  typename?: string | undefined;
}

export type ValidationRule = unknown;

export interface TypeInfo {
  [key: string]: unknown;
}
