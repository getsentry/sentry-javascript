import { registerDeprecationHandler } from '@ember/debug';

export function initialize(): void {
  registerDeprecationHandler((message, options, next) => {
    if (options && options.until && options.until !== '3.0.0') {
      return;
    } else {
      // @ts-expect-error this is fine
      next(message, options);
    }
  });
}

export default { initialize };
