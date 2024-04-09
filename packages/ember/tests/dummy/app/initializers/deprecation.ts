import { registerDeprecationHandler } from '@ember/debug';

export function initialize(): void {
  registerDeprecationHandler((message, options, next) => {
    if (options && options.until && options.until !== '3.0.0') {
      return;
    } else {
      // We do not use @ts-expect-error here because this only fails in certain versions...
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore this is fine
      next(message, options);
    }
  });
}

export default { initialize };
