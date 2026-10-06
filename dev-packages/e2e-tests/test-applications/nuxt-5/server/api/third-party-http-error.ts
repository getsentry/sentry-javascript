import { defineHandler } from 'nitro';

// Mimics ky's and got's `HTTPError`: it shares its `name` with h3's error class, but keeps the
// status on `response` instead of on the error itself.
class ThirdPartyHTTPError extends Error {
  public readonly response = { status: 404 };

  public constructor(message: string) {
    super(message);
    this.name = 'HTTPError';
  }
}

export default defineHandler(() => {
  throw new ThirdPartyHTTPError('Nuxt 5 third-party HTTPError');
});
