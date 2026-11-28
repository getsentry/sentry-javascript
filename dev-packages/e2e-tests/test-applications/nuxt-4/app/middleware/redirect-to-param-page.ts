import { defineNuxtRouteMiddleware, navigateTo } from '#imports';

export default defineNuxtRouteMiddleware(() => navigateTo('/test-param/redirect-target'));
