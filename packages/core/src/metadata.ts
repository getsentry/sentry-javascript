import type { Event } from './types-hoist/event';
import type { StackParser } from './types-hoist/stacktrace';
import { GLOBAL_OBJ } from './utils/worldwide';

/** Keys are source filename/url, values are metadata objects. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const filenameMetadataMap = new Map<string, any>();
/** Set of stack strings that have already been parsed. */
const parsedStacks = new Set<string>();

function ensureMetadataStacksAreParsed(parser: StackParser): void {
  if (!GLOBAL_OBJ._sentryModuleMetadata) {
    return;
  }

  for (const stack of Object.keys(GLOBAL_OBJ._sentryModuleMetadata)) {
    const metadata = GLOBAL_OBJ._sentryModuleMetadata[stack];

    if (parsedStacks.has(stack)) {
      continue;
    }

    // Ensure this stack doesn't get parsed again
    parsedStacks.add(stack);

    const frames = parser(stack);

    // Go through the frames starting from the top of the stack and find the first one with a filename
    for (const frame of frames.reverse()) {
      if (frame.filename) {
        // Save the metadata for this filename
        filenameMetadataMap.set(frame.filename, metadata);
        break;
      }
    }
  }
}

/**
 * Retrieve metadata for a specific JavaScript file URL.
 *
 * Metadata is injected by the Sentry bundler plugins using the `_experiments.moduleMetadata` config option.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getMetadataForUrl(parser: StackParser, filename: string): any | undefined {
  ensureMetadataStacksAreParsed(parser);
  return filenameMetadataMap.get(filename);
}

/**
 * Adds metadata to stack frames.
 *
 * Metadata is injected by the Sentry bundler plugins using the `_experiments.moduleMetadata` config option.
 */
export function addMetadataToStackFrames(parser: StackParser, event: Event): void {
  event.exception?.values?.forEach(exception => {
    exception.stacktrace?.frames?.forEach(frame => {
      if (!frame.filename || frame.module_metadata) {
        return;
      }

      const metadata = getMetadataForUrl(parser, frame.filename);

      if (metadata) {
        frame.module_metadata = metadata;
      }
    });
  });
}

/**
 * Strips metadata from stack frames.
 */
export function stripMetadataFromStackFrames(event: Event): void {
  event.exception?.values?.forEach(exception => {
    exception.stacktrace?.frames?.forEach(frame => {
      delete frame.module_metadata;
    });
  });
}
