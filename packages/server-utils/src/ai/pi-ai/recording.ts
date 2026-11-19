import type { Scope, Span } from '@sentry/core';
import { getCurrentScope } from '@sentry/core';
import type { GenAiSpanHooks, GenAiSpanResult } from '../core/span-hooks';
import { runGenAiSpanEnd, runGenAiSpanStart } from '../core/span-hooks';
import type { GenAiCallOptions, GenAiOptions } from '../core/utils';
import { resolveGenAiCallRecording, resolveRecordingOption } from '../core/utils';
import type { PiAiCallInfo, PiAssistantMessage } from './types';

const DRIVER_KEY = 'piAiDriver';

/** The options of the integration driving pi-ai, bound to its call info. */
export interface PiAiDriver {
  recording: () => GenAiOptions;
  onSpanStart: (span: Span) => void;
  onSpanEnd: (span: Span, result: GenAiSpanResult<PiAssistantMessage>) => void;
}

/**
 * Apply the recording options and span hooks of an integration that sends its model calls through
 * pi-ai, such as Flue, to the `gen_ai.chat` spans of the requests sent under `scope`. Options and
 * hooks that are functions get `call`.
 */
export function setPiAiDriverOptions<TCall>(
  scope: Scope,
  options: GenAiCallOptions<TCall> & GenAiSpanHooks<TCall, PiAssistantMessage>,
  call: TCall,
): void {
  const driver: PiAiDriver = {
    recording: () => ({
      recordInputs: resolveRecordingOption(options.recordInputs, call),
      recordOutputs: resolveRecordingOption(options.recordOutputs, call),
    }),
    onSpanStart: span => runGenAiSpanStart(options, span, call),
    onSpanEnd: (span, result) => runGenAiSpanEnd(options, span, call, result),
  };
  scope.setSDKProcessingMetadata({ [DRIVER_KEY]: driver });
}

/** The integration driving the pi-ai requests sent from the current scope, if any. */
export function getPiAiDriver(): PiAiDriver | undefined {
  return getCurrentScope().getScopeData().sdkProcessingMetadata[DRIVER_KEY] as PiAiDriver | undefined;
}

/**
 * The recording options of a pi-ai request, read when it starts: its response can settle outside the
 * scope it was sent from. An explicit `false` on either integration, or from either one's function,
 * keeps the content out, since an opt-out must not depend on which integration it was set on.
 * Otherwise the integration driving pi-ai comes first, then `piAiIntegration`, then
 * `dataCollection.genAI`.
 */
export function resolvePiAiRecordingOptions(
  options: GenAiCallOptions<PiAiCallInfo>,
  call: PiAiCallInfo,
  driver = getPiAiDriver(),
): Required<GenAiOptions> {
  const driverRecording = driver?.recording();
  const own = {
    recordInputs: resolveRecordingOption(options.recordInputs, call),
    recordOutputs: resolveRecordingOption(options.recordOutputs, call),
  };
  const { recordInputs, recordOutputs } = resolveGenAiCallRecording(own, call);
  return {
    recordInputs: own.recordInputs !== false && (driverRecording?.recordInputs ?? recordInputs),
    recordOutputs: own.recordOutputs !== false && (driverRecording?.recordOutputs ?? recordOutputs),
  };
}
