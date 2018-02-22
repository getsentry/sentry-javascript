import { SentryError } from './sentry';

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

  private fromString(str: string) {
    const match = DSN_REGEX.exec(str);
    if (!match) {
      throw new SentryError('Invalid DSN');
    }

    const [source, protocol, user, pass = '', host, port = '', path] = match;
    Object.assign(this, { source, protocol, user, pass, host, port, path });
  }

  public toString(withPass: boolean = false) {
    const { host, path, pass, port, protocol, user } = this;
    return (
      `${protocol}://${user}${withPass ? pass : ''}` +
      `@${host}${port ? ':' + port : ''}/${path}`
    );
  }
}
