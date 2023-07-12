import type { Event, StackParser } from '@sentry/types';
import { GLOBAL_OBJ } from '@sentry/utils';

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
  try {
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
  } catch (_) {
    // To save bundle size we're just try catching here instead of checking for the existence of all the different objects.
  }
}

/**
 * Strips metadata from stack frames.
 */
export function stripMetadataFromStackFrames(event: Event): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    event.exception!.values!.forEach(exception => {
      if (!exception.stacktrace) {
        return;
      }

      for (const frame of exception.stacktrace.frames || []) {
        delete frame.module_metadata;
      }
    });
  } catch (_) {
    // To save bundle size we're just try catching here instead of checking for the existence of all the different objects.
  }
}
