import { describe, expect, it } from 'vitest';
import { filterCookies } from '../../../../src/utils/data-collection/filterCookies';

describe('filterCookies', () => {
  describe('off mode (false)', () => {
    it('returns empty record', () => {
      expect(filterCookies('theme=dark; user_session=abc123', false, 'cookie')).toEqual({});
    });
  });

  describe('denyList mode (true)', () => {
    it('filters sensitive cookie names and preserves safe ones', () => {
      const result = filterCookies('theme=dark; user_session=abc123; locale=en', true, 'cookie');

      expect(result).toEqual({
        theme: 'dark',
        user_session: '[Filtered]', // matches "session"
        locale: 'en',
      });
    });

    it('filters auth-related cookies', () => {
      const result = filterCookies('auth_token=xyz; color=blue', true, 'cookie');

      expect(result).toEqual({
        auth_token: '[Filtered]', // matches "auth" and "token"
        color: 'blue',
      });
    });

    it('filters cookie-specific sensitive names', () => {
      const result = filterCookies(
        'theme=dark; connect.sid=abc; remember_me=xyz; __secure-token=secret',
        true,
        'cookie',
      );

      expect(result).toEqual({
        theme: 'dark',
        'connect.sid': '[Filtered]', // matches ".sid"
        remember_me: '[Filtered]', // matches "remember"
        '__secure-token': '[Filtered]', // matches "__secure-" and "token"
      });
    });
  });

  describe('denyList mode ({ deny: [...] })', () => {
    it('applies extra deny terms on top of built-in denylist', () => {
      const result = filterCookies('theme=dark; tracking_id=abc', { deny: ['tracking'] }, 'cookie');

      expect(result).toEqual({
        theme: 'dark',
        tracking_id: '[Filtered]',
      });
    });
  });

  describe('allowList mode ({ allow: [...] })', () => {
    it('only allows specified cookie names to pass through', () => {
      const result = filterCookies(
        'theme=dark; user_session=abc; locale=en',
        {
          allow: ['theme', 'locale'],
        },
        'cookie',
      );

      expect(result).toEqual({
        theme: 'dark',
        user_session: '[Filtered]', // sensitive denylist overrides
        locale: 'en',
      });
    });

    it('sensitive denylist overrides allowlist', () => {
      const result = filterCookies('auth_token=secret', { allow: ['auth_token'] }, 'cookie');

      expect(result).toEqual({
        auth_token: '[Filtered]', // "auth" and "token" match sensitive denylist
      });
    });
  });

  describe('empty and unparseable input', () => {
    it('returns empty record for empty string', () => {
      expect(filterCookies('', true, 'cookie')).toEqual({});
    });

    it('returns an empty record when the string holds no cookie', () => {
      expect(filterCookies(';;;', true, 'cookie')).toEqual({});
    });
  });

  describe('nameless cookies', () => {
    it.each(['y7Uu0Rk2QpLmXv3; theme=dark', '=y7Uu0Rk2QpLmXv3; theme=dark', 'theme=dark; y7Uu0Rk2QpLmXv3'])(
      'filters the nameless token in %j and keeps the named cookie',
      cookieString => {
        expect(filterCookies(cookieString, true, 'cookie')).toEqual({ '': '[Filtered]', theme: 'dark' });
      },
    );

    it.each(['y7Uu0Rk2QpLmXv3', '=y7Uu0Rk2QpLmXv3'])('filters %j when it is the only cookie', cookieString => {
      expect(filterCookies(cookieString, true, 'cookie')).toEqual({ '': '[Filtered]' });
    });

    it('filters the nameless token when an allowlist is configured', () => {
      expect(filterCookies('y7Uu0Rk2QpLmXv3; theme=dark', { allow: ['theme'] }, 'cookie')).toEqual({
        '': '[Filtered]',
        theme: 'dark',
      });
    });
  });

  describe('Set-Cookie header', () => {
    it('does not report Set-Cookie attributes as cookie pairs', () => {
      expect(filterCookies('sid=1; Max-Age=3600; Path=/', true, 'set-cookie')).toEqual({ sid: '[Filtered]' });
    });

    it('does not report Expires/Domain attributes as cookie pairs', () => {
      expect(
        filterCookies('theme=dark; Expires=Wed, 21 Oct 2026 07:28:00 GMT; Domain=example.com', true, 'set-cookie'),
      ).toEqual({ theme: 'dark' });
    });

    it('reads each cookie of several Set-Cookie headers joined with ","', () => {
      expect(
        filterCookies(
          'sid=s3cr3t; Expires=Wed, 21 Oct 2026 07:28:00 GMT; Path=/, theme=dark; Path=/',
          true,
          'set-cookie',
        ),
      ).toEqual({ sid: '[Filtered]', theme: 'dark' });
    });

    it('filters the token of a nameless cookie', () => {
      expect(filterCookies('y7Uu0Rk2QpLmXv3; HttpOnly; Secure', true, 'set-cookie')).toEqual({ '': '[Filtered]' });
    });
  });

  describe('edge cases', () => {
    it('reads attribute-like names in a Cookie header as cookies', () => {
      expect(filterCookies('theme=dark; Path=/checkout', true, 'cookie')).toEqual({ theme: 'dark', Path: '/checkout' });
    });

    it('handles cookies with = in the value', () => {
      const result = filterCookies('data=base64==; theme=light', true, 'cookie');

      expect(result).toEqual({
        data: 'base64==',
        theme: 'light',
      });
    });

    it('handles quoted cookie values', () => {
      const result = filterCookies('theme="dark mode"', true, 'cookie');

      expect(result).toEqual({
        theme: 'dark mode',
      });
    });
  });
});
