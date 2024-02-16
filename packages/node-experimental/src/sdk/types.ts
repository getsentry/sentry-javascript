import type {
  Attachment,
  Breadcrumb,
  Contexts,
  EventProcessor,
  Extras,
  Primitive,
  PropagationContext,
  Scope,
  SeverityLevel,
  User,
} from '@sentry/types';

export interface ScopeData {
  eventProcessors: EventProcessor[];
  breadcrumbs: Breadcrumb[];
  user: User;
  tags: { [key: string]: Primitive };
  extra: Extras;
  contexts: Contexts;
  attachments: Attachment[];
  propagationContext: PropagationContext;
  sdkProcessingMetadata: { [key: string]: unknown };
  fingerprint: string[];
  level?: SeverityLevel;
}

export interface CurrentScopes {
  scope: Scope;
  isolationScope: Scope;
}
