import { WINDOW, startBrowserTracingNavigationSpan, startBrowserTracingPageLoadSpan } from "@sentry/browser";
import {
	SEMANTIC_ATTRIBUTE_SENTRY_OP,
	SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
	SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
} from "@sentry/core";

import { browserTracingIntegration as originalBrowserTracingIntegration } from "@sentry/react";
import type { Client, Integration } from "@sentry/types";

import type { TanstackRouter } from "./types";

/**
 * A custom browser tracing integration for Tanstack Router.
 */
export function tanstackRouterBrowserTracingIntegration(
	router: TanstackRouter,
	options: Parameters<typeof originalBrowserTracingIntegration>[0] = {}
): Integration {
	const browserTracingIntegrationInstance = originalBrowserTracingIntegration({
		...options,
		instrumentNavigation: false,
		instrumentPageLoad: false,
	});

	const { instrumentPageLoad = true, instrumentNavigation = true } = options;

	return {
		...browserTracingIntegrationInstance,
		afterAllSetup(client) {
			const initPathName = WINDOW && WINDOW.location && WINDOW.location.pathname;
			if (instrumentPageLoad && initPathName) {
				startBrowserTracingPageLoadSpan(client, {
					name: initPathName,
					attributes: {
						[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: "url",
						[SEMANTIC_ATTRIBUTE_SENTRY_OP]: "pageload",
						[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: "auto.pageload.react.tanstack_router",
					},
				});
			}

			if (instrumentNavigation) {
				tanstackRouterInstrumentNavigation(router, client);
			}

			browserTracingIntegrationInstance.afterAllSetup(client);
		},
	};
}

export function tanstackRouterInstrumentNavigation(router: TanstackRouter, client: Client): void {
	router.history.subscribe(() => {
		const state = router.state;
		const matches = state.pendingMatches ?? state.matches;
		const lastMatch = matches[matches.length - 1];
		if (!lastMatch) return;

		const routeId = lastMatch?.routeId;
		if (!routeId) return;

		startBrowserTracingNavigationSpan(client, {
			name: routeId,
			attributes: {
				[SEMANTIC_ATTRIBUTE_SENTRY_OP]: "navigation",
				[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: "auto.navigation.tanstack_router.router_instrumentation",
				[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: "route",
			},
		});
	});
}
