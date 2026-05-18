export const PII_HEADER_SNIPPETS = ['forwarded', '-ip', 'remote-', 'via', '-user'];

export const SENSITIVE_KEY_SNIPPETS = [
  'auth',
  'token',
  'secret',
  'session', // for the user_session cookie
  'password',
  'passwd',
  'pwd',
  'key',
  'jwt',
  'bearer',
  'sso',
  'saml',
  'csrf',
  'xsrf',
  'credentials',
  'session',
  'sid',
  'identity',
  // Always treat cookie headers as sensitive in case individual key-value cookie pairs cannot properly be extracted
  'set-cookie',
  'cookie',
];

/**
 * Extra substrings matched only against individual Cookie / Set-Cookie **names** (not header names),
 * so we can cover common session secrets that do not match {@link SENSITIVE_KEY_SNIPPETS}
 * (e.g. `connect.sid` does not contain `session`) without false positives on arbitrary HTTP headers.
 *
 * Cookie names are checked with the same `includes()` list as headers plus these entries; omit redundant
 * cookie-only snippets that are already implied by a header match (e.g. `oauth` → `auth`, `id_token` → `token`,
 * `next-auth` → `auth`).
 */
export const SENSITIVE_COOKIE_NAME_SNIPPETS = [
  // Express / Connect default session cookie
  '.sid',
  // Opaque session ids (PHPSESSID, ASPSESSIONID*, BIGipServer*, *sessid*, …)
  'sessid',
  // Laravel etc. "remember me" tokens
  'remember',
  // OIDC / OAuth auxiliary (`oauth*` covered by header snippet `auth`)
  'oidc',
  'pkce',
  'nonce',
  // RFC 6265bis high-security cookie name prefixes
  '__secure-',
  '__host-',
  // Load balancer / CDN sticky-session cookies (opaque routing tokens)
  'awsalb',
  'awselb',
  'akamai',
  // BaaS / IdP session cookies (names often omit "session")
  '__stripe',
  'cognito',
  'firebase',
  'supabase',
  'sb-',
  // Step-up / MFA cookies
  'mfa',
  '2fa',
];
