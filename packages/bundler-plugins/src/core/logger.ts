interface LoggerOptions {
  silent: boolean;
  debug: boolean;
  prefix: string;
}

export type Logger = {
  info(message: string, ...params: unknown[]): void;
  warn(message: string, ...params: unknown[]): void;
  error(message: string, ...params: unknown[]): void;
  debug(message: string, ...params: unknown[]): void;
};

// Logging everything to stderr not to interfere with stdout
export function createLogger(options: LoggerOptions): Logger {
  return {
    info(message: string, ...params: unknown[]) {
      if (!options.silent) {
        // eslint-disable-next-line no-console
        console.info(`${options.prefix} Info: ${message}`, ...params);
      }
    },
    warn(message: string, ...params: unknown[]) {
      if (!options.silent) {
        // eslint-disable-next-line no-console
        console.warn(`${options.prefix} Warning: ${message}`, ...params);
      }
    },
    error(message: string, ...params: unknown[]) {
      if (!options.silent) {
        // eslint-disable-next-line no-console
        console.error(`${options.prefix} Error: ${message}`, ...params);
      }
    },
    debug(message: string, ...params: unknown[]) {
      if (!options.silent && options.debug) {
        // eslint-disable-next-line no-console
        console.debug(`${options.prefix} Debug: ${message}`, ...params);
      }
    },
  };
}
