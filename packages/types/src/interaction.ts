import type { Measurements } from './measurement';
import type { Span } from './span';

export interface InteractionSpan extends Span {
  measurements?: Measurements;
}
