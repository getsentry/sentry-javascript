import type { Event, StackParser } from '@sentry/types';
import { GLOBAL_OBJ } from '@sentry/utils';

/**
 * Keys are source filenames/urls, values are metadata objects.
 */
let filenameMetadataMap: Record<string, object> | undefined;

function ensureMetadataStacksAreParsed(parser: StackParser): void {
  if (!GLOBAL_OBJ.__MODULE_METADATA__) {
    return;
  }

  for (const stack of Object.keys(GLOBAL_OBJ.__MODULE_METADATA__)) {
    const metadata = GLOBAL_OBJ.__MODULE_METADATA__[stack];

    // If this stack has already been parsed, we can skip it
    if (metadata == false) {
      continue;
    }

    // Ensure this stack doesn't get parsed again
    GLOBAL_OBJ.__MODULE_METADATA__[stack] = false;

    const frames = parser(stack);

    // Go through the frames starting from the top of the stack and find the first one with a filename
    for (const frame of frames.reverse()) {
      if (frame.filename) {
        filenameMetadataMap = filenameMetadataMap || {};
        // Save the metadata for this filename
        filenameMetadataMap[frame.filename] = metadata;
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
export function getMetadataForUrl(parser: StackParser, url: string): object | undefined {
  ensureMetadataStacksAreParsed(parser);
  return filenameMetadataMap ? filenameMetadataMap[url] : undefined;
}

/**
 * Adds metadata to stack frames.
 *
 * Metadata is injected by the Sentry bundler plugins using the `_experiments.moduleMetadata` config option.
 */
export function addMetadataToStackFrames(parser: StackParser, event: Event): void {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  event.exception!.values!.forEach(exception => {
    if (!exception.stacktrace) {
      return;
    }

    for (const frame of exception.stacktrace.frames || []) {
      if (!frame.filename) {
        continue;
      }

      const metadata = getMetadataForUrl(parser, frame.filename);

      if (metadata) {
        frame.module_metadata = metadata;
      }
    }
  });
}

/**
 * Strips metadata from stack frames.
 */
export function stripMetadataFromStackFrames(event: Event): void {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  event.exception!.values!.forEach(exception => {
    if (!exception.stacktrace) {
      return;
    }

    for (const frame of exception.stacktrace.frames || []) {
      delete frame.module_metadata;
    }
  });
}
