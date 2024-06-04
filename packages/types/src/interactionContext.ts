import type { Span } from './span';
import type { User } from './user';

export type InteractionContext = {
  routeName: string;
  duration: number;
  parentContext: any;
  user?: User;
  activeSpan?: Span;
  replayId?: string;
  startTime: number;
};
