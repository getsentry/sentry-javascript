import { SentryError } from './error';

const DSN_REGEX = /^(?:(\w+):)\/\/(?:(\w+)(:\w+)?@)([\w\.-]+)(?::(\d+))?\/(.+)/;

/** TODO */
export interface DSNComponents {
  source: string;
  protocol: string;
  user: string;
  pass: string;
  host: string;
  port: string;
  path: string;
}

/** TODO */
export class DSN implements DSNComponents {
  /** TODO */
  public source!: string;
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
      Object.assign(this, from);
    }
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

    const [source, protocol, user, pass = '', host, port = '', path] = match;
    Object.assign(this, { host, pass, path, port, protocol, source, user });
  }
}
