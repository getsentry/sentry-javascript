import { DEBUG_BUILD } from '../debug-build';
import type { DsnComponents, DsnLike, DsnProtocol } from '../types-hoist/dsn';
import { consoleSandbox, debug } from './debug-logger';

/** Regular expression used to extract org ID from a DSN host. */
const ORG_ID_REGEX = /^o(\d+)\./;

/** Regular expression used to parse a Dsn. */
const DSN_REGEX = /^(?:(\w+):)\/\/(?:(\w+)(?::(\w+)?)?@)([\w.-]+)(?::(\d+))?\/(.+)/;

function isValidProtocol(protocol?: string): protocol is DsnProtocol {
  return protocol === 'http' || protocol === 'https';
}

/**
 * Renders the string representation of this Dsn.
 *
 * By default, this will render the public representation without the password
 * component. To get the deprecated private representation, set `withPassword`
 * to true.
 *
 * @param withPassword When set to true, the password will be included.
 */
export function dsnToString(dsn: DsnComponents, withPassword: boolean = false): string {
  const { host, path, pass, port, projectId, protocol, publicKey } = dsn;
  return (
    `${protocol}://${publicKey}${withPassword && pass ? `:${pass}` : ''}` +
    `@${host}${port ? `:${port}` : ''}/${path ? `${path}/` : path}${projectId}`
  );
}

/**
 * Parses a Dsn from a given string.
 *
 * @param str A Dsn as string
 * @returns Dsn as DsnComponents or undefined if @param str is not a valid DSN string
 */
export function dsnFromString(str: string): DsnComponents | undefined {
  const match = DSN_REGEX.exec(str);

  if (!match) {
    // This should be logged to the console
    consoleSandbox(() => {
      // eslint-disable-next-line no-console
      console.error(`Invalid Sentry Dsn: ${str}`);
    });
    return undefined;
  }

  const [protocol, publicKey, pass = '', host = '', port = '', lastPath = ''] = match.slice(1);
  let path = '';
  let projectId = lastPath;

  const split = projectId.split('/');
  if (split.length > 1) {
    path = split.slice(0, -1).join('/');
    projectId = split.pop() as string;
  }

  if (projectId) {
    const projectMatch = projectId.match(/^\d+/);
    if (projectMatch) {
      projectId = projectMatch[0];
    }
  }

  return dsnFromComponents({ host, pass, path, projectId, port, protocol: protocol as DsnProtocol, publicKey });
}

function dsnFromComponents(components: DsnComponents): DsnComponents {
  return {
    protocol: components.protocol,
    publicKey: components.publicKey || '',
    pass: components.pass || '',
    host: components.host,
    port: components.port || '',
    path: components.path || '',
    projectId: components.projectId,
  };
}

function validateDsn(dsn: DsnComponents): boolean {
  if (!DEBUG_BUILD) {
    return true;
  }

  const { port, projectId, protocol } = dsn;

  const requiredComponents: ReadonlyArray<keyof DsnComponents> = ['protocol', 'publicKey', 'host', 'projectId'];
  const hasMissingRequiredComponent = requiredComponents.find(component => {
    if (!dsn[component]) {
      debug.error(`Invalid Sentry Dsn: ${component} missing`);
      return true;
    }
    return false;
  });

  if (hasMissingRequiredComponent) {
    return false;
  }

  if (!projectId.match(/^\d+$/)) {
    debug.error(`Invalid Sentry Dsn: Invalid projectId ${projectId}`);
    return false;
  }

  if (!isValidProtocol(protocol)) {
    debug.error(`Invalid Sentry Dsn: Invalid protocol ${protocol}`);
    return false;
  }

  if (port && isNaN(parseInt(port, 10))) {
    debug.error(`Invalid Sentry Dsn: Invalid port ${port}`);
    return false;
  }

  return true;
}

/**
 * Extract the org ID from a DSN host.
 *
 * @param host The host from a DSN
 * @returns The org ID if found, undefined otherwise
 */
export function extractOrgIdFromDsnHost(host: string): string | undefined {
  const match = host.match(ORG_ID_REGEX);

  return match?.[1];
}

/**
 * Creates a valid Sentry Dsn object, identifying a Sentry instance and project.
 * @returns a valid DsnComponents object or `undefined` if @param from is an invalid DSN source
 */
export function makeDsn(from: DsnLike): DsnComponents | undefined {
  const components = typeof from === 'string' ? dsnFromString(from) : dsnFromComponents(from);
  if (!components || !validateDsn(components)) {
    return undefined;
  }
  return components;
}
