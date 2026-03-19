import { DEBUG_BUILD } from '../debug-build';
import { GLOBAL_OBJ } from './worldwide';
import { debug } from './debug-logger';

const WINDOW = GLOBAL_OBJ as unknown as Window;

interface CacheableImplementations {
  setTimeout: typeof WINDOW.setTimeout;
  fetch: typeof WINDOW.fetch;
}

export function getNativeImplementationFromIframe<T extends keyof CacheableImplementations>(name: T) {
  let impl = undefined;
  const document = WINDOW.document;
  // eslint-disable-next-line deprecation/deprecation
  if (document && typeof document.createElement === 'function') {
    try {
      const sandbox = document.createElement('iframe');
      sandbox.hidden = true;
      document.head.appendChild(sandbox);
      const contentWindow = sandbox.contentWindow;
      if (contentWindow?.[name]) {
        impl = contentWindow[name] as CacheableImplementations[T];
      }
      document.head.removeChild(sandbox);
    } catch (e) {
      // Could not create sandbox iframe, just use window.xxx
      DEBUG_BUILD && debug.warn(`Could not create sandbox iframe for ${name} check, bailing to window.${name}: `, e);
    }
  }
  return impl;
}
