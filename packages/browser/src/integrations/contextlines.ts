import type { Event, EventProcessor, Integration } from '@sentry/types';

interface ContextLinesOptions {
  /**
   * Sets the number of context lines for each frame when loading a file.
   * Defaults to 7.
   *
   * Set to 0 to disable loading and inclusion of source files.
   **/
  frameContextLines?: number;
}

/**
 * Collects source context lines around the line of a stackframe
 * This integration only works for stack frames pointing to JS that's directly embedded
 * in HTML files.
 * It DOES NOT work for stack frames pointing to JS files that are loaded by the browser.
 * For frames pointing to files, context lines are added during ingestino and symbolication
 * by attempting to download the JS files to the Sentry backend.
 */
export class ContextLines implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'ContextLines';

  /**
   * @inheritDoc
   */
  public name: string = ContextLines.id;

  public constructor(
    private readonly _options: ContextLinesOptions = {
      frameContextLines: 0,
    },
  ) {}

  /**
   * @inheritDoc
   */
  public setupOnce(addGlobalEventProcessor: (callback: EventProcessor) => void): void {
    addGlobalEventProcessor(event => this.addSourceContext(event));
  }

  /** Processes an event and adds context lines */
  public addSourceContext(event: Event): Event {
    return event;
  }
}
