import SentryError from './error';

const DSN_REGEX = /^(?:(\w+):)\/\/(?:(\w+)(:\w+)?@)([\w\.-]+)(?::(\d+))?\/(.+)/;

export interface DSNComponents {
  source: string;
  protocol: string;
  user: string;
  pass: string;
  host: string;
  port: string;
  path: string;
}

export default class DSN implements DSNComponents {
  public source: string;
  public protocol: string;
  public user: string;
  public pass: string;
  public host: string;
  public port: string;
  public path: string;

  constructor(from: string | DSNComponents) {
    if (typeof from === 'string') {
      this.fromString(from);
    } else {
      Object.assign(this, from);
    }
  }

  public toString(withPass: boolean = false): string {
    // tslint:disable-next-line:no-this-assignment
    const { host, path, pass, port, protocol, user } = this;
    return (
      `${protocol}://${user}${withPass ? pass : ''}` +
      `@${host}${port ? ':' + port : ''}/${path}`
    );
  }

  private fromString(str: string): void {
    const match = DSN_REGEX.exec(str);
    if (!match) {
      throw new SentryError('Invalid DSN');
    }

    const [source, protocol, user, pass = '', host, port = '', path] = match;
    Object.assign(this, { source, protocol, user, pass, host, port, path });
  }
}
