declare module '@apm-js-collab/tracing-hooks' {
  import type { InstrumentationConfig } from '@apm-js-collab/code-transformer';

  type PatchConfig = { instrumentations: InstrumentationConfig[] };

  /** Hooks require */
  export default class ModulePatch {
    public constructor(config: PatchConfig): ModulePatch;
    public patch(): void;
  }
}
