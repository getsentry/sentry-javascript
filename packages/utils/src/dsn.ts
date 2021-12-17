import { Dsn, DsnComponents, DsnLike, DsnProtocol } from '@sentry/types';

import { isDebugBuild } from './env';
import { SentryError } from './error';
import { getGlobalObject } from './global';

function isValidProtocol(protocol?: string): protocol is DsnProtocol {
  return protocol === 'http' || protocol === 'https';
}

function normalizeProtocol(input: string): string {
  return input.replace(/:$/, '');
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
  const { hostname, port, path, pass, projectId, protocol, publicKey } = dsn;
  return (
    `${protocol}://${publicKey}${withPassword && pass ? `:${pass}` : ''}` +
    `@${hostname}${port ? `:${port}` : ''}${path}/${projectId}`
  );
}

function dsnFromString(str: string): Dsn {
  const global = getGlobalObject<{ URL: typeof URL }>();
  const url = new global.URL(str);

  const pathComponents = url.pathname.split('/');
  const projectId = pathComponents.pop();

  return dsnFromComponents({
    hostname: url.hostname,
    pass: url.password,
    path: pathComponents.join('/'),
    projectId: projectId || '',
    port: url.port,
    protocol: normalizeProtocol(url.protocol) as DsnProtocol,
    publicKey: url.username,
  });
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
    hostname: components.hostname,
    port: components.port || '',
    path: components.path || '',
    projectId: components.projectId,
  };
}

function validateDsn(dsn: Dsn): boolean {
  if (isDebugBuild()) {
    const { port, projectId, protocol } = dsn;

    const requiredComponents: ReadonlyArray<keyof DsnComponents> = ['protocol', 'publicKey', 'hostname', 'projectId'];
    requiredComponents.forEach(component => {
      if (!dsn[component]) {
        throw new SentryError(`Invalid Dsn: ${component} missing`);
      }
    });

    if (!projectId.match(/^\d+$/)) {
      throw new SentryError(`Invalid Dsn: Invalid projectId ${projectId}`);
    }

    if (!isValidProtocol(protocol)) {
      throw new SentryError(`Invalid Dsn: Invalid protocol ${protocol}`);
    }

    if (port && isNaN(parseInt(port, 10))) {
      throw new SentryError(`Invalid Dsn: Invalid port ${port}`);
    }
  }

  return true;
}

/** The Sentry Dsn, identifying a Sentry instance and project. */
export function makeDsn(from: DsnLike): Dsn {
  const components = typeof from === 'string' ? dsnFromString(from) : dsnFromComponents(from);

  validateDsn(components);

  const dsn: Dsn = {
    ...components,
    toString: (withPassword: boolean) => dsntoString(dsn, withPassword),
  };

  return dsn;
}
