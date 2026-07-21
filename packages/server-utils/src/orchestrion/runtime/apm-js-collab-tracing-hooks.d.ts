// Ambient declarations for `@apm-js-collab/tracing-hooks`, which ships no types of its own.
// `register.ts` loads these modules through `require`/`createRequire`, but the static
// `import` of the package entry still needs the module to resolve at type-check time.

declare module '@apm-js-collab/tracing-hooks' {
  import type { InstrumentationConfig } from '@apm-js-collab/code-transformer-bundler-plugins/core';

  type PatchConfig = { instrumentations: InstrumentationConfig[] };

  /** Patches `Module.prototype._compile` to transform CJS modules as they load. */
  export default class ModulePatch {
    public constructor(config?: PatchConfig);
    public patch(): void;
    public unpatch(): void;
  }
}

declare module '@apm-js-collab/tracing-hooks/lib/diagnostics.js' {
  type DiagnosticsEvent = { url: string; moduleName: string; error?: Error };

  export function setDiagnosticsHook(callback: (event: DiagnosticsEvent) => void): void;
  export function emitDiagnostics(event: DiagnosticsEvent): void;
}

declare module '@apm-js-collab/tracing-hooks/hook-sync.mjs' {
  import type { MessagePort } from 'node:worker_threads';
  import type { InstrumentationConfig } from '@apm-js-collab/code-transformer';

  type DiagnosticsEvent = { url: string; moduleName: string; error?: Error };
  type InitializeData = { instrumentations?: InstrumentationConfig[]; diagnosticsPort?: MessagePort };

  export function initialize(data?: InitializeData): void;
  export function resolve(specifier: string, context: unknown, nextResolve: Function): unknown;
  export function load(url: string, context: unknown, nextLoad: Function): unknown;
  export function setDiagnosticsHook(callback: (event: DiagnosticsEvent) => void): void;
  export function createDiagnosticsPort(): MessagePort;
}
