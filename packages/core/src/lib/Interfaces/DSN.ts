import { SentryError } from '../Sentry';

interface IDSNParts {
  source: string;
  protocol: string;
  user: string;
  pass: string;
  host: string;
  port: string;
  path: string;
}

const DSN_REGEX = /^(?:(\w+):)\/\/(?:(\w+)(:\w+)?@)([\w\.-]+)(?::(\d+))?(\/.*)/;

export class DSN {
  private dsnString: string;
  private dsn: IDSNParts;

  constructor(dsnString: string) {
    this.dsnString = dsnString;
    this.parseDsn();
    return this;
  }

  public getDsn(withPass: boolean) {
    return (
      `${this.dsn.protocol}://${this.dsn.user}${withPass ? this.dsn.pass : ''}` +
      `@${this.dsn.host}${this.dsn.port ? ':' + this.dsn.port : ''}${this.dsn.path}`
    );
  }

  private parseDsn() {
    const match = DSN_REGEX.exec(this.dsnString);
    if (match) {
      this.dsn = {
        source: match[0],
        protocol: match[1],
        user: match[2],
        pass: match[3] || '',
        host: match[4],
        port: match[5] || '',
        path: match[6],
      };
    } else {
      throw new SentryError('invalid dsn');
    }
  }
}
