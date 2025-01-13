import { registerDeprecationHandler } from '@ember/debug';

export function initialize(): void {
  registerDeprecationHandler((message, options, next) => {
    if (options?.until && options.until !== '3.0.0') {
      return;
    } else {
      next(message, options);
    }
  });
}

export default { initialize };
