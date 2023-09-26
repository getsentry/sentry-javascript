import type { Client, Event, EventHint, Integration } from '@sentry/types';
import { applyAggregateErrorsToEvent, exceptionFromError } from '@sentry/utils';

const DEFAULT_KEY = 'cause';
const DEFAULT_LIMIT = 5;

/** Adds SDK info to an event. */
export class LinkedErrors implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'LinkedErrors';

  /**
   * @inheritDoc
   */
  public readonly name: string = LinkedErrors.id;

  /**
   * @inheritDoc
   */
  private readonly _key: string;

  /**
   * @inheritDoc
   */
  private readonly _limit: number;

  /**
   * @inheritDoc
   */
  public constructor(options: { key?: string; limit?: number } = {}) {
    this._key = options.key || DEFAULT_KEY;
    this._limit = options.limit || DEFAULT_LIMIT;
  }

  /** @inheritdoc */
  public setupOnce(): void {
    // noop
  }

  /**
   * @inheritDoc
   */
  public preprocessEvent(event: Event, hint: EventHint | undefined, client: Client): void {
    const options = client.getOptions();

    applyAggregateErrorsToEvent(
      exceptionFromError,
      options.stackParser,
      options.maxValueLength,
      this._key,
      this._limit,
      event,
      hint,
    );
  }
}
