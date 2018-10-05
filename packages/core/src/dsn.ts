import { DsnComponents, DsnLike, DsnProtocol } from '@sentry/types';
import { isNaN } from '@sentry/utils/is';
import { assign } from '@sentry/utils/object';
import { SentryError } from './error';

/** Regular expression used to parse a Dsn. */
const DSN_REGEX = /^(?:(\w+):)\/\/(?:(\w+)(?::(\w+))?@)([\w\.-]+)(?::(\d+))?\/(.+)/;

/** The Sentry Dsn, identifying a Sentry instance and project. */
export class Dsn implements DsnComponents {
  /** Protocol used to connect to Sentry. */
  public protocol!: DsnProtocol;
  /** Public authorization key. */
  public user!: string;
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
  public constructor(from: DsnLike) {
    if (typeof from === 'string') {
      this.fromString(from);
    } else {
      this.fromComponents(from);
    }

    this.validate();
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
  public toString(withPassword: boolean = false): string {
    // tslint:disable-next-line:no-this-assignment
    const { host, path, pass, port, projectId, protocol, user } = this;
    return (
      `${protocol}://${user}${withPassword && pass ? `:${pass}` : ''}` +
      `@${host}${port ? `:${port}` : ''}/${path ? `${path}/` : path}${projectId}`
    );
  }

  /** Parses a string into this Dsn. */
  private fromString(str: string): void {
    const match = DSN_REGEX.exec(str);
    if (!match) {
      throw new SentryError('Invalid Dsn');
    }

    const [protocol, user, pass = '', host, port = '', lastPath] = match.slice(1);
    let path = '';
    let projectId = lastPath;
    const split = projectId.split('/');
    if (split.length > 1) {
      path = split.slice(0, -1).join('/');
      projectId = split.pop() as string;
    }
    assign(this, { host, pass, path, projectId, port, protocol, user });
  }

  /** Maps Dsn components into this instance. */
  private fromComponents(components: DsnComponents): void {
    this.protocol = components.protocol;
    this.user = components.user;
    this.pass = components.pass || '';
    this.host = components.host;
    this.port = components.port || '';
    this.path = components.path || '';
    this.projectId = components.projectId;
  }

  /** Validates this Dsn and throws on error. */
  private validate(): void {
    for (const component of ['protocol', 'user', 'host', 'projectId']) {
      if (!this[component as keyof DsnComponents]) {
        throw new SentryError(`Invalid Dsn: Missing ${component}`);
      }
    }

    if (this.protocol !== 'http' && this.protocol !== 'https') {
      throw new SentryError(`Invalid Dsn: Unsupported protocol "${this.protocol}"`);
    }

    if (this.port && isNaN(parseInt(this.port, 10))) {
      throw new SentryError(`Invalid Dsn: Invalid port number "${this.port}"`);
    }
  }
}
