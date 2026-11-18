import type { Scope } from '@sentry/core';
import { getCurrentScope } from '@sentry/core';
import type { GenAiCallOptions, GenAiOptions } from '../core/utils';
import { resolveGenAiCallRecording, resolveRecordingOption } from '../core/utils';
import type { PiAiCallInfo } from './types';

const RECORDING_OPTIONS_KEY = 'piAiRecordingOptions';

type DriverRecording = () => GenAiOptions;

/**
 * Apply the recording options of an integration that sends its model calls through pi-ai, such as
 * Flue, to the `gen_ai.chat` spans of the requests sent under `scope`. Options that are functions
 * get `call` when such a span starts.
 */
export function setPiAiRecordingOptions<TCall>(scope: Scope, options: GenAiCallOptions<TCall>, call: TCall): void {
  const resolve: DriverRecording = () => ({
    recordInputs: resolveRecordingOption(options.recordInputs, call),
    recordOutputs: resolveRecordingOption(options.recordOutputs, call),
  });
  scope.setSDKProcessingMetadata({ [RECORDING_OPTIONS_KEY]: resolve });
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
): Required<GenAiOptions> {
  const driver = (
    getCurrentScope().getScopeData().sdkProcessingMetadata[RECORDING_OPTIONS_KEY] as DriverRecording | undefined
  )?.();
  const own = {
    recordInputs: resolveRecordingOption(options.recordInputs, call),
    recordOutputs: resolveRecordingOption(options.recordOutputs, call),
  };
  const { recordInputs, recordOutputs } = resolveGenAiCallRecording(own, call);
  return {
    recordInputs: own.recordInputs !== false && (driver?.recordInputs ?? recordInputs),
    recordOutputs: own.recordOutputs !== false && (driver?.recordOutputs ?? recordOutputs),
  };
}
