import { Contexts } from './context';
import { Extras } from './extra';
import { Primitive } from './misc';
import { RequestSession } from './session';
import { SeverityLevel } from './severity';
import { User } from './user';

/** JSDocs */
export type CaptureContextCallback = (scope: Scope) => Scope;
export type CaptureContext = Scope | Partial<ScopeContext> | CaptureContextCallback;

/** JSDocs */
export interface ScopeContext {
  user: User;
  level: SeverityLevel;
  extra: Extras;
  contexts: Contexts;
  tags: { [key: string]: Primitive };
  fingerprint: string[];
  requestSession: RequestSession;
}

export type Scope = any;
