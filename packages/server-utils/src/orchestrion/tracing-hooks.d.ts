declare module '@apm-js-collab/tracing-hooks' {
  export default class ModulePatch {
    constructor(options: { instrumentations: unknown });
    patch(): void;
  }
}

declare module '@apm-js-collab/tracing-hooks/hook-sync.mjs' {
  export function initialize(options: { instrumentations: unknown }): void;
  export const resolve: unknown;
  export const load: unknown;
}
