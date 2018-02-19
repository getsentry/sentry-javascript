import { SentryError } from './sentry';

interface DSNInterface {
  source: string;
  protocol: string;
  user: string;
  pass: string;
  host: string;
  port: string;
  path: string;
}

const DSN_REGEX = /^(?:(\w+):)\/\/(?:(\w+)(:\w+)?@)([\w\.-]+)(?::(\d+))?\/(.+)/;

export class DSN {
  private dsn: DSNInterface;

  constructor(dsn: string) {
    this.dsn = this.parseDSN(dsn);
  }

  public getDSN(withPass: boolean = false) {
    const { host, path, pass, port, protocol, user } = this.dsn;
    return (
      `${protocol}://${user}${withPass ? pass : ''}` +
      `@${host}${port ? ':' + port : ''}/${path}`
    );
  }

  private parseDSN(dsn: string): DSNInterface {
    const match = DSN_REGEX.exec(dsn);
    if (!match) throw new SentryError('Invalid DSN');

    const [source, protocol, user, pass = '', host, port = '', path] = match;

    return {
      source,
      protocol,
      user,
      pass,
      host,
      port,
      path,
    };
  }
}
