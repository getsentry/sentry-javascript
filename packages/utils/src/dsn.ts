import { DsnComponents, DsnLike, DsnProtocol } from '@sentry/types';

import { isDebugBuild } from './env';
import { SentryError } from './error';

/** Regular expression used to parse a Dsn. */
const DSN_REGEX = /^(?:(\w+):)\/\/(?:(\w+)(?::(\w+))?@)([\w.-]+)(?::(\d+))?\/(.+)/;

/** Error message */
const ERROR_MESSAGE = 'Invalid Dsn';

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
function dsntoString(dsn: Dsn, withPassword: boolean = false): string {
  const { host, path, pass, port, projectId, protocol, publicKey } = dsn;
  return (
    `${protocol}://${publicKey}${withPassword && pass ? `:${pass}` : ''}` +
    `@${host}${port ? `:${port}` : ''}/${path ? `${path}/` : path}${projectId}`
  );
}

function dsnFromString(str: string): Dsn {
  const match = DSN_REGEX.exec(str);

  if (!match) {
    throw new SentryError(ERROR_MESSAGE);
  }

  const [protocol, publicKey, pass = '', host, port = '', lastPath] = match.slice(1);
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

  if (isValidProtocol(protocol)) {
    return dsnFromComponents({ host, pass, path, projectId, port, protocol: protocol, publicKey });
  }

  throw new SentryError(ERROR_MESSAGE);
}

function dsnFromComponents(components: DsnComponents): Dsn {
  // TODO this is for backwards compatibility, and can be removed in a future version
  if ('user' in components && !('publicKey' in components)) {
    components.publicKey = components.user;
  }

  return {
    user: components.publicKey || '',
    protocol: components.protocol,
    publicKey: components.publicKey || '',
    pass: components.pass || '',
    host: components.host,
    port: components.port || '',
    path: components.path || '',
    projectId: components.projectId,
  };
}

function validateDsn(dsn: Dsn): boolean {
  if (isDebugBuild()) {
    const { port, projectId, protocol } = dsn;

    ['protocol', 'publicKey', 'host', 'projectId'].forEach(component => {
      if (!dsn[component]) {
        throw new SentryError(`${ERROR_MESSAGE}: ${component} missing`);
      }
    });

    if (!projectId.match(/^\d+$/)) {
      throw new SentryError(`${ERROR_MESSAGE}: Invalid projectId ${projectId}`);
    }

    if (isValidProtocol(protocol)) {
      throw new SentryError(`${ERROR_MESSAGE}: Invalid protocol ${protocol}`);
    }

    if (port && isNaN(parseInt(port, 10))) {
      throw new SentryError(`${ERROR_MESSAGE}: Invalid port ${port}`);
    }
  }

  return true;
}

function makeDsn(from: DsnLike): Dsn {
  let dsn = typeof from === 'string' ? dsnFromString(from) : dsnFromComponents(from);

  return {
    ...dsn,
    toString: () => dsntoString(dsn),
  };
}
/** The Sentry Dsn, identifying a Sentry instance and project. */
export class Dsn implements DsnComponents {
  /** Protocol used to connect to Sentry. */
  public protocol!: DsnProtocol;
  /** Public authorization key (deprecated, renamed to publicKey). */
  public user!: string;
  /** Public authorization key. */
  public publicKey!: string;
  /** Private authorization key (deprecated, optional). */
  public pass!: string;
  /** Hostname of the Sentry instance. */
  public host!: string;
  /** Port of the Sentry instance. */
  public port!: string;
  /** Path */
  public path!: string;
  /** Project ID */
  public projectId!: string;

  /** Creates a new Dsn component */
  public constructor(from: DsnLike) {}
}
