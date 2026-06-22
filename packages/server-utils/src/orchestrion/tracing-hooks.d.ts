declare module '@apm-js-collab/tracing-hooks' {
  export function initialize(options: { instrumentations: unknown }): void;
  export const resolve: unknown;
  export const load: unknown;
  export class ModulePatch {
    constructor(options: { instrumentations: unknown });
    patch(): void;
  }
}
