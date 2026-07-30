// Vendored copies of the `@apm-js-collab/code-transformer` /
// `@apm-js-collab/code-transformer-bundler-plugins` types that appear in this package's public API.
// Those packages are bundled devDependencies, so the emitted `build/types` declarations must not
// reference them — consumers don't have them installed and their `tsc` would fail with TS2307.

/** The kind of function */
export type FunctionKind = 'Sync' | 'Async' | 'Callback' | 'Auto';

/** Describes which function to instrument */
export type FunctionQuery =
  | { className: string; methodName: string; kind: FunctionKind; index?: number | null; isExportAlias?: boolean }
  | { className: string; privateMethodName: string; kind: FunctionKind; index?: number | null }
  | { className: string; index?: number | null; isExportAlias?: boolean }
  | { methodName: string; kind: FunctionKind; index?: number | null }
  | { functionName: string; kind: FunctionKind; index?: number | null; isExportAlias?: boolean }
  | { expressionName: string; kind: FunctionKind; index?: number | null; isExportAlias?: boolean };

/**
 * A custom transform function registered via `addTransform`. Receives the instrumentation state
 * and the matched AST node.
 *
 * Upstream types the node parameters with estree's `Node`; here they are `unknown` so the shipped
 * declarations don't depend on `@types/estree` being installed.
 */
export type CustomTransform = (state: unknown, node: unknown, parent: unknown, ancestry: unknown[]) => void;

/**
 * The behaviour-only fields of a `FunctionQuery`. Used together with `astQuery`, where the raw
 * selector chooses the node and these fields drive how it is wrapped (the name-based matching
 * fields are ignored).
 */
export interface FunctionBehavior {
  kind?: FunctionKind;
  index?: number | null;
  callbackIndex?: number;
  mutableResult?: boolean;
}

/** Describes the module and file path you would like to match */
export interface ModuleMatcher {
  /** The name of the module you want to match */
  name: string;
  /** The semver range that you want to match */
  versionRange: string;
  /** The path of the file you want to match from the module root */
  filePath: string | RegExp;
}

/**
 * Configuration for injecting instrumentation code.
 *
 * Either `functionQuery` (name-based matching) or `astQuery` (a raw esquery selector) must
 * identify the node(s) to instrument. When `astQuery` is set it takes precedence over
 * `functionQuery`'s matching fields, and `functionQuery` becomes an optional bag of behaviour
 * options ({@link FunctionBehavior}).
 */
export type InstrumentationConfig =
  | {
      /** The name of the diagnostics channel to publish to */
      channelName: string;
      /** The module matcher to identify the module and file to instrument */
      module: ModuleMatcher;
      /** The function query to identify the function to instrument */
      functionQuery: FunctionQuery;
      /**
       * A raw esquery selector that chooses the node(s) to instrument. When set, it takes
       * precedence over `functionQuery`'s matching fields.
       */
      astQuery?: string;
      /**
       * The name of a custom transform registered via `addTransform`. When set, takes precedence
       * over `functionQuery.kind`.
       */
      transform?: string;
    }
  | {
      channelName: string;
      module: ModuleMatcher;
      /**
       * A raw esquery selector that chooses the node(s) to instrument. This is the escape hatch
       * for shapes the name-based `functionQuery` can't express, e.g. an anonymous arrow returned
       * by a factory function.
       */
      astQuery: string;
      /** Behaviour options for the matched node(s); matching fields are ignored. */
      functionQuery?: FunctionBehavior;
      transform?: string;
    };

/**
 * A plain-object encoding of a `RegExp` that survives JSON serialization. Revive it with
 * `new RegExp(source, flags)`.
 */
export interface SerializedRegExp {
  type: 'RegExp';
  source: string;
  flags: string;
}

/**
 * An `InstrumentationConfig` whose `module.filePath` is never a `RegExp` instance — regexes are
 * encoded as {@link SerializedRegExp} — making the whole config a POJO that can cross
 * serialization boundaries such as Turbopack's loader options.
 */
export type SerializableInstrumentationConfig = InstrumentationConfig extends infer T
  ? T extends { module: InstrumentationConfig['module'] }
    ? Omit<T, 'module'> & { module: Omit<T['module'], 'filePath'> & { filePath: string | SerializedRegExp } }
    : never
  : never;

/** Either the native config shape or its JSON-safe counterpart. */
export type AnyInstrumentationConfig = InstrumentationConfig | SerializableInstrumentationConfig;

/** Diagnostics passed to the `injectDiagnostics` callback. */
export interface TransformDiagnostics {
  transformedModules: string[];
  failedModules: string[];
}

/**
 * A matcher for module ids, mirroring the shape accepted by the bundler transform hook filter
 * (Rollup >= 4.38, Rolldown, Vite). A single string/RegExp (or array) is treated as an `include`;
 * the object form allows both.
 */
export type TransformIdFilter =
  | string
  | RegExp
  | Array<string | RegExp>
  | {
      include?: string | RegExp | Array<string | RegExp>;
      exclude?: string | RegExp | Array<string | RegExp>;
    };

/** Options accepted by the code-transformer bundler plugins. */
export interface CodeTransformerPluginOptions {
  /** Array of instrumentation configurations */
  instrumentations: InstrumentationConfig[];
  /** Optional path to a polyfill module for diagnostics_channel */
  dcModule?: string;
  /** Optional callback that that injects the code returned */
  injectDiagnostics?: (diagnostics: TransformDiagnostics) => string | undefined;
  /**
   * Custom transforms registered on the matcher via orchestrion's `addTransform`. An
   * `InstrumentationConfig` opts in by naming one of these in its `transform` field; the function
   * is then called for every AST node matched by that config's `functionQuery`/`astQuery` with
   * `(state, node, parent, ancestry)`, where `state` is the matched config spread together with
   * `{ dcModule, moduleType, moduleVersion }`.
   *
   * A single transform can serve many configs — each invocation can branch on
   * `state.module.name` or `state.channelName` to tell the sites apart.
   */
  customTransforms?: Record<string, CustomTransform>;
  /**
   * Restricts which modules the transform hook runs on, via the bundler's hook filter
   * (Rollup >= 4.38, Rolldown, Vite). All built-in instrumentations live within `node_modules`,
   * which is the default. Provide your own matcher to broaden or narrow this — e.g. to also
   * transform your own source — or pass `false` to disable filtering entirely.
   *
   * Bundlers without hook-filter support (esbuild, webpack) ignore this; the transformer skips
   * non-matching modules regardless.
   *
   * @default /node_modules/
   */
  transformFilter?: TransformIdFilter | false;
}
