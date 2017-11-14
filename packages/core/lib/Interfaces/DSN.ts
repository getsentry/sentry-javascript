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

export class DSN {
  private dsnString: string;
  private dsn: IDSNParts;
  private dsnRegex = /^(?:(\w+):)\/\/(?:(\w+)(:\w+)?@)([\w\.-]+)(?::(\d+))?(\/.*)/;

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
    const match = this.dsnRegex.exec(this.dsnString);
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
