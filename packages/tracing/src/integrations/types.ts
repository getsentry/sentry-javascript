/**
 * A type returned by some APIs which contains a list of DOMString (strings).
 *
 * Copy DOMStringList interface so that user's dont have to include dom typings with Tracing integration
 * Based on https://github.com/microsoft/TypeScript/blob/4cf0afe2662980ebcd8d444dbd13d8f47d06fcd5/lib/lib.dom.d.ts#L4051
 */
interface DOMStringList {
  /**
   * Returns the number of strings in strings.
   */
  readonly length: number;
  /**
   * Returns true if strings contains string, and false otherwise.
   */
  contains(str: string): boolean;
  /**
   * Returns the string with index index from strings.
   */
  item(index: number): string | null;
  [index: number]: string;
}

declare var DOMStringList: {
  prototype: DOMStringList;
  new (): DOMStringList;
};

/**
 * The location (URL) of the object it is linked to. Changes done on it are reflected on the object it relates to.
 * Both the Document and Window interface have such a linked Location, accessible via Document.location and Window.location respectively.
 *
 * Copy Location interface so that user's dont have to include dom typings with Tracing integration
 * Based on https://github.com/microsoft/TypeScript/blob/4cf0afe2662980ebcd8d444dbd13d8f47d06fcd5/lib/lib.dom.d.ts#L9691
 */
export interface Location {
  /**
   * Returns a DOMStringList object listing the origins of the ancestor browsing contexts, from the parent browsing context to the top-level browsing context.
   */
  readonly ancestorOrigins: DOMStringList;
  /**
   * Returns the Location object's URL's fragment (includes leading "#" if non-empty).
   *
   * Can be set, to navigate to the same URL with a changed fragment (ignores leading "#").
   */
  hash: string;
  /**
   * Returns the Location object's URL's host and port (if different from the default port for the scheme).
   *
   * Can be set, to navigate to the same URL with a changed host and port.
   */
  host: string;
  /**
   * Returns the Location object's URL's host.
   *
   * Can be set, to navigate to the same URL with a changed host.
   */
  hostname: string;
  /**
   * Returns the Location object's URL.
   *
   * Can be set, to navigate to the given URL.
   */
  href: string;
  // tslint:disable-next-line: completed-docs
  toString(): string;
  /**
   * Returns the Location object's URL's origin.
   */
  readonly origin: string;
  /**
   * Returns the Location object's URL's path.
   *
   * Can be set, to navigate to the same URL with a changed path.
   */
  pathname: string;
  /**
   * Returns the Location object's URL's port.
   *
   * Can be set, to navigate to the same URL with a changed port.
   */
  port: string;
  /**
   * Returns the Location object's URL's scheme.
   *
   * Can be set, to navigate to the same URL with a changed scheme.
   */
  protocol: string;
  /**
   * Returns the Location object's URL's query (includes leading "?" if non-empty).
   *
   * Can be set, to navigate to the same URL with a changed query (ignores leading "?").
   */
  search: string;
  /**
   * Navigates to the given URL.
   */
  assign(url: string): void;
  /**
   * Reloads the current page.
   */
  reload(): void;
  /** @deprecated */
  // tslint:disable-next-line: unified-signatures completed-docs
  reload(forcedReload: boolean): void;
  /**
   * Removes the current page from the session history and navigates to the given URL.
   */
  replace(url: string): void;
}
