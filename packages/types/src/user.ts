/** JSDoc */
export interface User extends Record<string, unknown> {
  /**
   * The application-specific internal identifier for the user.
   */
  id?: string;

  /**
   * The username. Typically used as a better label than the internal id.
   */
  username?: string;

  /**
   * An alternative, or addition, to the username.
   * Sentry is aware of email addresses and can display things such as Gravatars and unlock messaging capabilities.
   */
  email?: string;

  /**
   * The user's IP address.
   * If the user is unauthenticated, Sentry uses the IP address as a unique identifier for the user.
   * Set to "{{auto}}" to let Sentry infer the IP address from the connection.
   */
  ip_address?: string | '{{auto}}';
}
