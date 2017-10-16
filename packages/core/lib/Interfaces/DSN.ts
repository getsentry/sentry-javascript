type DSNParts = {
  source: string;
  protocol: string;
  user: string;
  pass: string;
  host: string;
  port: string;
  path: string;
};

export class DSN {
  private dsnString: string;
  private dsn: DSNParts;
  private dsnRegex = /^(?:(\w+):)?\/\/(?:(\w+)(:\w+)?@)?([\w\.-]+)(?::(\d+))?(\/.*)/;
  constructor(dsnString: string) {
    this.dsnString = dsnString;
    this.parseDsn();
    return this;
  }

  private parseDsn() {
    let match = this.dsnRegex.exec(this.dsnString);
    if (match) {
      this.dsn = {
        source: match[0],
        protocol: match[1],
        user: match[2],
        pass: match[3] || '',
        host: match[4],
        port: match[5] || '',
        path: match[6]
      };
    }
    // TODO: else error
  }

  getDsn(withPass: boolean) {
    return (
      `${this.dsn.protocol}://${this.dsn.user}${withPass ? this.dsn.pass : ''}` +
      `@${this.dsn.host}${this.dsn.port ? ':' + this.dsn.port : ''}${this.dsn.path}`
    );
  }
}
