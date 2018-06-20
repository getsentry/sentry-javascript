import { DSNComponents, DSNLike, DSNProtocol } from '@sentry/types';
import { SentryError } from './error';

/** Regular expression used to parse a DSN. */
const DSN_REGEX = /^(?:(\w+):)\/\/(?:(\w+)(?::(\w+))?@)([\w\.-]+)(?::(\d+))?\/(.+)/;

/** The Sentry DSN, identifying a Sentry instance and project. */
export class DSN implements DSNComponents {
  /** Protocol used to connect to Sentry. */
  public protocol!: DSNProtocol;
  /** Public authorization key. */
  public user!: string;
  /** Private authorization key (deprecated, optional). */
  public pass!: string;
  /** Hostname of the Sentry instance. */
  public host!: string;
  /** Port of the Sentry instance. */
  public port!: string;
  /** Project path */
  public path!: string;

  /** Creates a new DSN component */
  public constructor(from: DSNLike) {
    if (typeof from === 'string') {
      this.fromString(from);
    } else {
      this.fromComponents(from);
    }

    this.validate();
  }

  /**
   * Renders the string representation of this DSN.
   *
   * By default, this will render the public representation without the password
   * component. To get the deprecated private representation, set `withPassword`
   * to true.
   *
   * @param withPassword When set to true, the password will be included.
   */
  public toString(withPassword: boolean = false): string {
    // tslint:disable-next-line:no-this-assignment
    const { host, path, pass, port, protocol, user } = this;
    return (
      `${protocol}://${user}${withPassword && pass ? `:${pass}` : ''}` +
      `@${host}${port ? `:${port}` : ''}/${path}`
    );
  }

  /** Parses a string into this DSN. */
  private fromString(str: string): void {
    const match = DSN_REGEX.exec(str);
    if (!match) {
      throw new SentryError('Invalid DSN');
    }

    const [protocol, user, pass = '', host, port = '', path] = match.slice(1);
    Object.assign(this, { host, pass, path, port, protocol, user });
  }

  /** Maps DSN components into this instance. */
  private fromComponents(components: DSNComponents): void {
    this.protocol = components.protocol;
    this.user = components.user;
    this.pass = components.pass || '';
    this.host = components.host;
    this.port = components.port || '';
    this.path = components.path;
  }

  /** Validates this DSN and throws on error. */
  private validate(): void {
    for (const component of ['protocol', 'user', 'host', 'path']) {
      if (!this[component as keyof DSNComponents]) {
        throw new SentryError(`Invalid DSN: Missing ${component}`);
      }
    }

    if (this.protocol !== 'http' && this.protocol !== 'https') {
      throw new SentryError(
        `Invalid DSN: Unsupported protocol "${this.protocol}"`,
      );
    }

    if (this.port && isNaN(parseInt(this.port, 10))) {
      throw new SentryError(`Invalid DSN: Invalid port number "${this.port}"`);
    }
  }
}
