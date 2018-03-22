let domain: any;

try {
  // tslint:disable-next-line:no-var-requires
  domain = require('domain');
} catch {
  domain = { active: false };
}

export const shimDomain = domain;
