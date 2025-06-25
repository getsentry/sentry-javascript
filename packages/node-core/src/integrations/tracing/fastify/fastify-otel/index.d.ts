/* eslint-disable @typescript-eslint/explicit-member-accessibility */
/// <reference types="node" />

import type { InstrumentationNodeModuleDefinition } from '@opentelemetry/instrumentation';
import { InstrumentationBase } from '@opentelemetry/instrumentation';
import type { FastifyPluginCallback } from 'fastify';
import type { FastifyOtelInstrumentationOpts, FastifyOtelOptions, FastifyOtelRequestContext } from './types';

declare module 'fastify' {
  interface FastifyRequest {
    opentelemetry(): FastifyOtelRequestContext;
  }
}

declare class FastifyOtelInstrumentation<
  Config extends FastifyOtelInstrumentationOpts = FastifyOtelInstrumentationOpts,
> extends InstrumentationBase<Config> {
  servername: string;
  constructor(config?: FastifyOtelInstrumentationOpts);
  init(): InstrumentationNodeModuleDefinition[];
  plugin(): FastifyPluginCallback<FastifyOtelOptions>;
}

declare namespace exported {
  export type { FastifyOtelInstrumentationOpts };
  export { FastifyOtelInstrumentation };
}

export = exported;
