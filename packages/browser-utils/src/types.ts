import { GLOBAL_OBJ } from '@sentry/core';

export const WINDOW = GLOBAL_OBJ as typeof GLOBAL_OBJ &
  // document is not available in all browser environments (webworkers). We make it optional so you have to explicitly check for it
  Omit<Window, 'document'> &
  Partial<Pick<Window, 'document'>>;

export type NetworkMetaWarning =
  | 'MAYBE_JSON_TRUNCATED'
  | 'TEXT_TRUNCATED'
  | 'URL_SKIPPED'
  | 'BODY_PARSE_ERROR'
  | 'BODY_PARSE_TIMEOUT'
  | 'UNPARSEABLE_BODY_TYPE';
