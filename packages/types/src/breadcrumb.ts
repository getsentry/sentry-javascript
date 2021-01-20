import { Severity } from './severity';

/**
 * Sentry uses breadcrumbs to create a trail of events that happened prior to an issue.
 * These events are very similar to traditional logs but can record more rich structured data.
 * @external https://develop.sentry.dev/sdk/event-payloads/breadcrumbs/
 */
export interface Breadcrumb {
  /**
   * The type of breadcrumb.
   * By default, all breadcrumbs are recorded as default,
   * which makes them appear as a Debug entry,
   * but Sentry provides other types that influence how the breadcrumbs are rendered.
   * For more information, see the description of recognized breadcrumb types.
   */
  type?: BreadcrumbTypes | string;

  /**
   * A dotted string indicating what the crumb is or from where it comes.
   * Typically it is a module name or a descriptive string.
   */
  category?: string;

  /**
   * Human readable message for the breadcrumb.
   * If a message is provided, it is rendered as text with all whitespace preserved.
   */
  message?: string;

  /**
   * Arbitrary data associated with this breadcrumb.
   * Contains a dictionary whose contents depend on the breadcrumb type.
   * Additional parameters that are unsupported by the type are rendered as a key/value table.
   */
  data?: Record<string, unknown>;

  /**
   * This defines the severity level of the breadcrumb.
   * Levels are used in the UI to emphasize and deemphasize the crumb.
   * The default is info.
   */
  level?: Severity;

  /**
   * A timestamp representing when the breadcrumb occurred.
   * Breadcrumbs are most useful when they include a timestamp,
   * as it creates a timeline leading up to an event expection/error.
   */
  timestamp?: number;

  event_id?: string;
}

/**
 * @external https://develop.sentry.dev/sdk/event-payloads/breadcrumbs/#breadcrumb-types
 */
export enum BreadcrumbTypes {
  /**
   * Describes a generic breadcrumb.
   * This is typically a log message or user-generated breadcrumb.
   * The data part is entirely undefined and as such, completely rendered as a key/value table.
   */
  default = 'default',

  /**
   * This is typically a log message.
   *  The data part is entirely undefined and as such, completely rendered as a key/value table.
   */
  debug = 'debug',

  /**
   * An error that occurred before the exception.
   */
  error = 'error',

  /**
   * A navigation event can be a URL change in a web application,
   * or a UI transition in a mobile or desktop application, etc.
   * Its data property has the following sub-properties:
   * - from (Required): A string representing the original application state / location.
   * - to (Required): A string representing the new application state / location.
   */
  navigation = 'navigation',

  /**
   * This represents an HTTP request transmitted from your application.
   * This could be an AJAX request from a web application,
   * or a server-to-server HTTP request to an API service provider, etc.
   * Its data property has the following sub-properties:
   * - url (optional): The request URL.
   * - method (optional): The HTTP request method.
   * - status_code (optional): The HTTP status code of the response.
   * - reason (optional): A text that describes the status code.
   */
  http = 'http',

  /**
   * Information that helps identify the root cause of the issue or for whom the error occurred.
   */
  info = 'info',

  /**
   * This represents a query that was made in your application.
   */
  query = 'query',

  /**
   * Describes a tracing event.
   */
  transaction = 'transaction',

  /**
   * A user interaction with your app's UI.
   */
  ui = 'ui',

  /**
   * A user interaction with your app's UI.
   */
  user = 'user',
}

/** JSDoc */
export interface BreadcrumbHint {
  [key: string]: any;
}
