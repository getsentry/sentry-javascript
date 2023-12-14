import type { Client, Event, EventHint, Integration } from '@sentry/types';
import { applyAggregateErrorsToEvent } from '@sentry/utils';

import { exceptionFromError } from '../eventbuilder';

const DEFAULT_KEY = 'cause';
const DEFAULT_LIMIT = 5;

interface LinkedErrorsOptions {
  key: string;
  limit: number;
}

/** Adds SDK info to an event. */
export class LinkedErrors implements Integration {
  /**
   * @inheritDoc
   */
  public static id = 'LinkedErrors';

  /**
   * @inheritDoc
   */
  public readonly name: string;

  /**
   * @inheritDoc
   */
  private readonly _key: LinkedErrorsOptions['key'];

  /**
   * @inheritDoc
   */
  private readonly _limit: LinkedErrorsOptions['limit'];

  /**
   * @inheritDoc
   */
  public constructor(options: Partial<LinkedErrorsOptions> = {}) {
    this.name = LinkedErrors.id;
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
