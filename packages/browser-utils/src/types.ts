import { GLOBAL_OBJ } from '@sentry/utils';

export const WINDOW = GLOBAL_OBJ as typeof GLOBAL_OBJ &
  // document is not available in all browser environments (webworkers). We make it optional so you have to explicitly check for it
  Omit<Window, 'document'> &
  Partial<Pick<Window, 'document'>>;
