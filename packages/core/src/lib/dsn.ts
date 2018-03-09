import { SentryError } from './error';

const DSN_REGEX = /^(?:(\w+):)\/\/(?:(\w+)(:\w+)?@)([\w\.-]+)(?::(\d+))?\/(.+)/;

/** TODO */
export interface DSNComponents {
  protocol: string;
  user: string;
  pass?: string;
  host: string;
  port?: string;
  path: string;
}

/** TODO */
export class DSN implements DSNComponents {
  /** TODO */
  public protocol!: string;
  /** TODO */
  public user!: string;
  /** TODO */
  public pass!: string;
  /** TODO */
  public host!: string;
  /** TODO */
  public port!: string;
  /** TODO */
  public path!: string;

  /** TODO */
  public constructor(from: string | DSNComponents) {
    if (typeof from === 'string') {
      this.fromString(from);
    } else {
      this.fromComponents(from);
    }

    this.assert('protocol', 'user', 'host', 'path');
  }

  /** TODO */
  public toString(withPass: boolean = false): string {
    // tslint:disable-next-line:no-this-assignment
    const { host, path, pass, port, protocol, user } = this;
    return (
      `${protocol}://${user}${withPass ? pass : ''}` +
      `@${host}${port ? `:${port}` : ''}/${path}`
    );
  }

  /** TODO */
  private fromString(str: string): void {
    const match = DSN_REGEX.exec(str);
    if (!match) {
      throw new SentryError('Invalid DSN');
    }

    const [protocol, user, pass = '', host, port = '', path] = match.slice(1);
    Object.assign(this, { host, pass, path, port, protocol, user });
  }

  /** TODO */
  private fromComponents(components: DSNComponents): void {
    this.protocol = components.protocol;
    this.user = components.user;
    this.pass = components.pass || '';
    this.host = components.host;
    this.port = components.port || '';
    this.path = components.path;
  }

  /** TODO */
  private assert(...components: Array<keyof DSNComponents>): void {
    for (const component of components) {
      if (!this[component]) {
        throw new SentryError(`Invalid DSN: Missing ${component}`);
      }
    }
  }
}
