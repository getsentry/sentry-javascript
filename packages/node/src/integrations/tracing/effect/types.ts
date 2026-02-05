// Type definitions based on Effect's actual API
export interface EffectSpan {
  name: string;
  startTime: bigint;
  endTime?: bigint;
  attributes?: Record<string, unknown>;
  status?: {
    code: number;
    message?: string;
  };
  parent?: EffectSpan;
}

export interface EffectExit<E = unknown, A = unknown> {
  readonly _tag: 'Success' | 'Failure' | 'Interrupt';
  readonly cause?: E;
  readonly value?: A;
}

export interface EffectTracer {
  onSpanStart?: (span: EffectSpan) => void;
  onSpanEnd?: (span: EffectSpan, exit: EffectExit) => void;
  span<A>(name: string, f: () => A): A;
  withSpan<A>(span: EffectSpan, f: () => A): A;
}

export interface EffectModule {
  Tracer?: {
    get?: () => EffectTracer | undefined;
    current?: () => EffectTracer | undefined;
    set?: (tracer: EffectTracer) => void;
    register?: (tracer: EffectTracer) => void;
    use?: (tracer: EffectTracer) => void;
  };
}
