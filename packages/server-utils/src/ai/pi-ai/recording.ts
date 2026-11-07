import type { Scope } from '@sentry/core';
import { getCurrentScope } from '@sentry/core';
import type { GenAiOptions } from '../core/utils';
import { resolveAIRecordingOptions } from '../core/utils';

const RECORDING_OPTIONS_KEY = 'piAiRecordingOptions';

/**
 * Apply the recording options of an integration that sends its model calls through pi-ai, such as
 * Flue, to the `gen_ai.chat` spans of the requests sent under `scope`.
 */
export function setPiAiRecordingOptions(scope: Scope, options: GenAiOptions): void {
  scope.setSDKProcessingMetadata({ [RECORDING_OPTIONS_KEY]: options });
}

/**
 * The recording options of a pi-ai request, read when it starts: its response can settle outside the
 * scope it was sent from. An explicit `false` on either integration keeps the content out, since an
 * opt-out must not depend on which integration it was set on. Otherwise the integration driving
 * pi-ai comes first, then `piAiIntegration`, then `dataCollection.genAI`.
 */
export function resolvePiAiRecordingOptions(options: GenAiOptions): Required<GenAiOptions> {
  const driver = getCurrentScope().getScopeData().sdkProcessingMetadata[RECORDING_OPTIONS_KEY] as
    | GenAiOptions
    | undefined;
  const { recordInputs, recordOutputs } = resolveAIRecordingOptions(options);
  return {
    recordInputs: options.recordInputs !== false && (driver?.recordInputs ?? recordInputs),
    recordOutputs: options.recordOutputs !== false && (driver?.recordOutputs ?? recordOutputs),
  };
}
