type BuildLogger = Pick<Console, 'debug' | 'error' | 'log' | 'warn'>;

const noop = (): void => {
  // noop
};

const SILENT_BUILD_LOGGER: BuildLogger = { debug: noop, error: noop, log: noop, warn: noop };

/**
 * Returns the logger for the SDK's own build-time output, honoring the `silent` build option.
 *
 * The bundler plugin gates its own logs on `silent` internally, so this only covers messages the
 * Next.js SDK prints itself.
 */
export function getBuildLogger(silent: boolean | undefined): BuildLogger {
  // eslint-disable-next-line no-console
  return silent ? SILENT_BUILD_LOGGER : console;
}
