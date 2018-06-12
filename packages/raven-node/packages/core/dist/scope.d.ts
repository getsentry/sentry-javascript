import { Scope as BaseScope } from '@sentry/shim';
import { Breadcrumb, SentryEvent, User } from '@sentry/types';
/** An object to call setter functions on to enhance the event */
export declare class Scope implements BaseScope {
    /**
     * Flag if notifiying is happening.
     */
    private notifying;
    /**
     * Callback for client to receive scope changes.
     */
    private scopeChanged;
    /** Array of breadcrumbs. */
    private breadcrumbs;
    /** User */
    private user;
    /** Tags */
    private tags;
    /** Extra */
    private extra;
    /** Fingerprint */
    private fingerprint?;
    /**
     * Create a new empty internal scope. This will not be exposed to the user.
     */
    constructor();
    /**
     * Set internal on change listener.
     */
    setOnChange(callback: (scope: Scope) => void): void;
    /**
     * This will be called on every set call.
     */
    private notifyListeners();
    /**
     * Updates user context information for future events.
     * @param user User context object to merge into current context.
     */
    setUser(user: User): void;
    /**
     * Updates tags context information for future events.
     * @param tags Tags context object to merge into current context.
     */
    setTag(key: string, value: string): void;
    /**
     * Updates extra context information for future events.
     * @param extra Extra context object to merge into current context.
     */
    setExtra(key: string, extra: any): void;
    /**
     * Sets the fingerprint on the scope to send with the events.
     * @param fingerprint
     */
    setFingerprint(fingerprint: string[]): void;
    /**
     * Inherit values from the parent scope.
     * @param scope
     */
    setParentScope(scope?: Scope): void;
    /** Returns breadcrumbs. */
    getBreadcrumbs(): Breadcrumb[];
    /** Returns tags. */
    getTags(): {
        [key: string]: string;
    };
    /** Returns extra. */
    getExtra(): {
        [key: string]: any;
    };
    /** Returns extra. */
    getUser(): User;
    /** Returns fingerprint. */
    getFingerprint(): string[] | undefined;
    /**
     * Sets the breadcrumbs in the scope
     * @param breadcrumbs
     * @param maxBreadcrumbs
     */
    addBreadcrumb(breadcrumb: Breadcrumb, maxBreadcrumbs?: number): void;
    /** Clears the current scope and resets its properties. */
    clear(): void;
    /**
     * Applies the current context and fingerprint to the event.
     * Note that breadcrumbs will be added by the client.
     * @param event
     * @param maxBreadcrumbs
     */
    applyToEvent(event: SentryEvent, maxBreadcrumbs?: number): void;
}
