import { registerDeprecationHandler } from '@ember/debug';

export function initialize() {
  registerDeprecationHandler((message, options, next) => {
    if (options && options.until && options.until !== '3.0.0') {
      return;
    } else {
      next(message, options);
    }
  });
}

export default { initialize };
