import { SpanContext as SpanContextInterface } from '@sentry/types';
import { uuid4 } from '@sentry/utils';

export class SpanContext implements SpanContextInterface {
  public constructor(
    public traceId: string = uuid4(),
    public spanId: string = uuid4().substring(16),
    public recorded: boolean = false,
    public parent?: SpanContext,
  ) {}

  /**
   * @inheritDoc
   */
  public toTraceparent(): string {
    return `00-${this.traceId}-${this.spanId}-${this.recorded ? '01' : '00'}`;
  }
}
