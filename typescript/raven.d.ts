// Type definitions for Raven.js
// Project: https://github.com/getsentry/raven-js
// Definitions by: Santi Albo <https://github.com/santialbo/>, Benjamin Pannell <http://github.com/spartan563>

declare var Raven: RavenStatic;

export = Raven;

interface BreadcrumbSettings {
    /* Whether to collect XHR calls, defaults to true */
    xhr?: boolean;

    /* Whether to collect console logs, defaults to true */
    console?: boolean;

    /* Whether to collect dom events, defaults to true */
    dom?: boolean;

    /* Whether to record window location and navigation, defaults to true */
    location?: boolean;
}

interface CommonRavenOptions {
    /** The environment of the application you are monitoring with Sentry */
    environment?: string;

    /** The release version of the application you are monitoring with Sentry */
    release?: string;

    /** Additional data to be tagged onto the error. */
    tags?: {
        [id: string]: string;
    };

    /** Exra metadata to collect */
    extra?: any;

    /** The name of the logger used by Sentry. Default: javascript */
    logger?: string;
}

interface RavenOptions extends CommonRavenOptions {

    /** The name of the server or device that the client is running on */
    server_name?: string;

    /** The log level associated with this event. Default: error */
    level?: string;

    /** set to true to get the strack trace of your message */
    stacktrace?: boolean;

    /** In some cases you may see issues where Sentry groups multiple events together when they should be separate entities. In other cases, Sentry simply doesn’t group events together because they’re so sporadic that they never look the same. */
    fingerprint?: string[];

    /** Number of frames to trim off the stacktrace, defaults to 1 */
    trimHeadFrames?: number;

    /** The name of the device platform. Default: "javascript" */
    platform?: string;
}

interface RavenGlobalOptions extends CommonRavenOptions  {

    /** The name of the server or device that the client is running on */
    serverName?: string;

    /** set to true to get the strack trace of your message */
    stacktrace?: boolean;

    /** List of messages to be fitlered out before being sent to Sentry. */
    ignoreErrors?: (RegExp | string)[];

    /** Configures which breadcrumbs are collected automatically */
    autoBreadcrumbs?: boolean | BreadcrumbSettings;

    /** Whether to collect errors on the window via TraceKit.collectWindowErrors. Defaults to true. */
    collectWindowErrors?: boolean;

    /** Max number of breadcrumbs to collect, defaults to 100 */
    maxBreadcrumbs?: number;

    /** Similar to ignoreErrors, but will ignore errors from whole urls patching a regex pattern. */
    ignoreUrls?: (RegExp | string)[];

    /** The inverse of ignoreUrls. Only report errors from whole urls matching a regex pattern. */
    whitelistUrls?: (RegExp | string)[];

    /** An array of regex patterns to indicate which urls are a part of your app. */
    includePaths?: (RegExp | string)[];

    /** Maximum amount of stack frames to collect, defaults to infinity */
    stackTraceLimit?: number;

    /** Override the default HTTP data transport handler. */
    transport?: (options: RavenTransportOptions) => void;

    /** By default, Raven does not truncate messages. If you need to truncate characters for whatever reason, you may set this to limit the length. */
    maxMessageLength?: number;

    /** A callback function that allows you to apply your own filters to determine if the message should be sent to Sentry. */
    shouldSendCallback?: (data: any) => boolean;

    /** A function which allows mutation of the data payload right before being sent to Sentry */
    dataCallback?: (data: any) => any;
}

interface RavenWrapOptions extends RavenOptions {
    /**
     * Whether to run the wrap recursively, defaults to false.
     */
    deep?: boolean;
}

/**
 * General details about the user to be logged to Sentry.
 */
interface RavenUserContext {
    id?: string;
    username?: string;
    email?: string;
}

interface RavenStatic {

    /** Raven.js version. */
    VERSION: string;

    Plugins: { [id: string]: RavenPlugin };

    /*
     * Allow Raven to be configured as soon as it is loaded
     * It uses a global RavenConfig = {dsn: '...', config: {}}
     *
     * @return undefined
     */
    afterLoad(): void;

    /*
     * Allow multiple versions of Raven to be installed.
     * Strip Raven from the global context and returns the instance.
     *
     * @return {Raven}
     */
    noConflict(): RavenStatic;

    /*
     * Configure Raven with a DSN and extra options
     *
     * @param {string} dsn The public Sentry DSN
     * @param {object} options Optional set of of global options [optional]
     * @return {Raven}
     */
    config(dsn: string, options?: RavenGlobalOptions): RavenStatic;

    /*
     * Installs a global window.onerror error handler
     * to capture and report uncaught exceptions.
     * At this point, install() is required to be called due
     * to the way TraceKit is set up.
     *
     * @return {Raven}
     */
    install(): RavenStatic;

    /*
     * Adds a plugin to Raven
     *
     * @return {Raven}
     */
    addPlugin(plugin: RavenPlugin, ...pluginArgs: any[]): RavenStatic;

    /*
     * Wrap code within a context so Raven can capture errors
     * reliably across domains that is executed immediately.
     *
     * @param {object} options A specific set of options for this context [optional]
     * @param {function} func The callback to be immediately executed within the context
     * @param {array} args An array of arguments to be called with the callback [optional]
     */
    context(func: Function, ...args: any[]): void;
    context(options: RavenWrapOptions, func: Function, ...args: any[]): void;

    /*
     * Wrap code within a context and returns back a new function to be executed
     *
     * @param {object} options A specific set of options for this context [optional]
     * @param {function} func The function to be wrapped in a new context
     * @return {function} The newly wrapped functions with a context
     */
    wrap(func: Function): Function;
    wrap(options: RavenWrapOptions, func: Function): Function;
    wrap<T extends Function>(func: T): T;
    wrap<T extends Function>(options: RavenWrapOptions, func: T): T;

    /*
     * Uninstalls the global error handler.
     *
     * @return {Raven}
     */
    uninstall(): RavenStatic;

    /*
     * Manually capture an exception and send it over to Sentry
     *
     * @param {error} ex An exception to be logged
     * @param {object} options A specific set of options for this error [optional]
     * @return {Raven}
     */
    captureException(ex: Error, options?: RavenOptions): RavenStatic;

    /*
     * Manually send a message to Sentry
     *
     * @param {string} msg A plain message to be captured in Sentry
     * @param {object} options A specific set of options for this message [optional]
     * @return {Raven}
     */
    captureMessage(msg: string, options?: RavenOptions): RavenStatic;

    /** Log a breadcrumb */
    captureBreadcrumb(crumb: Object): RavenStatic;

    /**
     * Clear the user context, removing the user data that would be sent to Sentry.
     */
    setUserContext(): RavenStatic;

    /*
     * Set a user to be sent along with the payload.
     *
     * @param {object} user An object representing user data [optional]
     * @return {Raven}
     */
    setUserContext(user: RavenUserContext): RavenStatic;

    /** Merge extra attributes to be sent along with the payload. */
    setExtraContext(context: Object): RavenStatic;

    /** Merge tags to be sent along with the payload. */
    setTagsContext(tags: Object): RavenStatic;

    /** Clear all of the context. */
    clearContext(): RavenStatic;

    /** Get a copy of the current context. This cannot be mutated.*/
    getContext(): Object;

    /** Override the default HTTP data transport handler. */
    setTransport(transportFunction: (options: RavenTransportOptions) => void): RavenStatic;

    /** Set environment of application */
    setEnvironment(environment: string): RavenStatic;

    /** Set release version of application */
    setRelease(release: string): RavenStatic;

    /** Get the latest raw exception that was captured by Raven.*/
    lastException(): Error;

    /** An event id is a globally unique id for the event that was just sent. This event id can be used to find the exact event from within Sentry. */
    lastEventId(): string;

    /** If you need to conditionally check if raven needs to be initialized or not, you can use the isSetup function. It will return true if Raven is already initialized. */
    isSetup(): boolean;

    /** Specify a function that allows mutation of the data payload right before being sent to Sentry. */
    setDataCallback(data: any, orig?: any): RavenStatic;

    /** Specify a callback function that allows you to mutate or filter breadcrumbs when they are captured. */
    setBreadcrumbCallback(data: any, orig?: any): RavenStatic;

    /** Specify a callback function that allows you to apply your own filters to determine if the message should be sent to Sentry. */
    setShouldSendCallback(data: any, orig?: any): RavenStatic;

    /** Show Sentry user feedback dialog */
    showReportDialog(options?: {
        eventId?: number,
        dsn?: string,
        user?: RavenUserContext,
    }): void;
}

interface RavenTransportOptions {
    url: string;
    data: any;
    auth: {
        sentry_version: string;
        sentry_client: string;
        sentry_key: string;
    };
    onSuccess: () => void;
    onFailure: () => void;
}

interface RavenPlugin {
    (raven: RavenStatic, ...args: any[]): RavenStatic;
}
