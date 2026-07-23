import * as net from 'node:net';
import {
  DB_COLLECTION_NAME,
  DB_NAMESPACE,
  DB_OPERATION_NAME,
  DB_SYSTEM_NAME,
  SENTRY_KIND,
  SERVER_ADDRESS,
  SERVER_PORT,
} from '@sentry/conventions/attributes';
import type { Span, SpanAttributes } from '@sentry/core';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, startInactiveSpan } from '@sentry/core';
import type { FirebaseApp, FirebaseOptions, FirestoreReference, FirestoreSettings } from './firestore-types';

/**
 * Opens the inactive `db.query` span for a Firestore operation. `bindTracingChannelToSpan` makes it the
 * active span for the traced call and ends it when the call settles. Mirrors the OTel integration's span,
 * with a distinct `auto.firebase.orchestrion.firestore` origin.
 */
export function startFirestoreSpan(spanName: string, reference: FirestoreReference): Span {
  return startInactiveSpan({
    name: `${spanName} ${reference.path}`,
    op: 'db.query',
    attributes: {
      [SENTRY_KIND]: 'client',
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.firebase.orchestrion.firestore',
      [DB_OPERATION_NAME]: spanName,
      ...buildAttributes(reference),
    },
  });
}

/**
 * Gets the server address and port attributes from the Firestore settings.
 * It's best effort to extract the address and port from the settings, especially for IPv6.
 * @param settings - The Firestore settings containing host information.
 */
export function getPortAndAddress(settings: FirestoreSettings): {
  address?: string;
  port?: number;
} {
  let address: string | undefined;
  let port: string | undefined;

  if (typeof settings.host === 'string') {
    if (settings.host.startsWith('[')) {
      // IPv6 addresses can be enclosed in square brackets, e.g., [2001:db8::1]:8080
      if (settings.host.endsWith(']')) {
        // IPv6 with square brackets without port
        address = settings.host.replace(/^\[|\]$/g, '');
      } else if (settings.host.includes(']:')) {
        // IPv6 with square brackets with port
        const lastColonIndex = settings.host.lastIndexOf(':');
        if (lastColonIndex !== -1) {
          address = settings.host.slice(1, lastColonIndex).replace(/^\[|\]$/g, '');
          port = settings.host.slice(lastColonIndex + 1);
        }
      }
    } else {
      // IPv4 or IPv6 without square brackets
      // If it's an IPv6 address without square brackets, we assume it does not have a port.
      if (net.isIPv6(settings.host)) {
        address = settings.host;
      }
      // If it's an IPv4 address, we can extract the port if it exists.
      else {
        const lastColonIndex = settings.host.lastIndexOf(':');
        if (lastColonIndex !== -1) {
          address = settings.host.slice(0, lastColonIndex);
          port = settings.host.slice(lastColonIndex + 1);
        } else {
          address = settings.host;
        }
      }
    }
  }
  return {
    address: address,
    port: port ? parseInt(port, 10) : undefined,
  };
}

function buildAttributes(reference: FirestoreReference): SpanAttributes {
  const firestoreApp: FirebaseApp = reference.firestore.app;
  const firestoreOptions: FirebaseOptions = firestoreApp.options;
  const settings: FirestoreSettings = reference.firestore.toJSON()?.settings || {};

  const attributes: SpanAttributes = {
    [DB_COLLECTION_NAME]: reference.path,
    [DB_NAMESPACE]: firestoreApp.name,
    [DB_SYSTEM_NAME]: 'firebase.firestore',
    'firebase.firestore.type': reference.type,
    'firebase.firestore.options.projectId': firestoreOptions.projectId,
    'firebase.firestore.options.appId': firestoreOptions.appId,
    'firebase.firestore.options.messagingSenderId': firestoreOptions.messagingSenderId,
    'firebase.firestore.options.storageBucket': firestoreOptions.storageBucket,
  };

  const { address, port } = getPortAndAddress(settings);

  if (address) {
    attributes[SERVER_ADDRESS] = address;
  }
  if (port) {
    attributes[SERVER_PORT] = port;
  }

  return attributes;
}
