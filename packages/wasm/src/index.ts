import { defineIntegration } from '@sentry/core';
import type { Event, IntegrationFn, StackFrame } from '@sentry/core';

import { patchWebAssembly } from './patchWebAssembly';
import { getImage, getImages } from './registry';

const INTEGRATION_NAME = 'Wasm';

const _wasmIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      patchWebAssembly();
    },
    processEvent(event: Event): Event {
      let hasAtLeastOneWasmFrameWithImage = false;

      if (event.exception?.values) {
        event.exception.values.forEach(exception => {
          if (exception.stacktrace?.frames) {
            hasAtLeastOneWasmFrameWithImage =
              hasAtLeastOneWasmFrameWithImage || patchFrames(exception.stacktrace.frames);
          }
        });
      }

      if (hasAtLeastOneWasmFrameWithImage) {
        event.debug_meta = event.debug_meta || {};
        event.debug_meta.images = [...(event.debug_meta.images || []), ...getImages()];
      }

      return event;
    },
  };
}) satisfies IntegrationFn;

export const wasmIntegration = defineIntegration(_wasmIntegration);

/**
 * Patches a list of stackframes with wasm data needed for server-side symbolication
 * if applicable. Returns true if the provided list of stack frames had at least one
 * matching registered image.
 */
function patchFrames(frames: Array<StackFrame>): boolean {
  let hasAtLeastOneWasmFrameWithImage = false;
  frames.forEach(frame => {
    if (!frame.filename) {
      return;
    }
    const match = frame.filename.match(/^(.*?):wasm-function\[\d+\]:(0x[a-fA-F0-9]+)$/) as
      | null
      | [string, string, string];
    if (match) {
      const index = getImage(match[1]);
      frame.instruction_addr = match[2];
      frame.filename = match[1];
      frame.platform = 'native';

      if (index >= 0) {
        frame.addr_mode = `rel:${index}`;
        hasAtLeastOneWasmFrameWithImage = true;
      }
    }
  });
  return hasAtLeastOneWasmFrameWithImage;
}
