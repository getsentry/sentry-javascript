import * as net from 'node:net';
import { InstrumentationNodeModuleDefinition, isWrapped } from '@opentelemetry/instrumentation';
import { InstrumentationNodeModuleFile } from '../../../InstrumentationNodeModuleFile';
import {
  DB_COLLECTION_NAME,
  DB_NAMESPACE,
  DB_OPERATION_NAME,
  DB_SYSTEM_NAME,
  SERVER_ADDRESS,
  SERVER_PORT,
} from '@sentry/conventions/attributes';
import type { SpanAttributes } from '@sentry/core';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, SPAN_KIND, startSpan } from '@sentry/core';
import type { FirebaseInstrumentation } from '../firebaseInstrumentation';
import type {
  AddDocType,
  CollectionReference,
  DeleteDocType,
  DocumentData,
  DocumentReference,
  FirebaseApp,
  FirebaseOptions,
  FirestoreSettings,
  GetDocsType,
  PartialWithFieldValue,
  QuerySnapshot,
  SetDocType,
  SetOptions,
  WithFieldValue,
} from '../types';

// Inline minimal types used from `shimmer` to avoid importing shimmer's types directly.
// We only need the shape for `wrap` and `unwrap` used in this file.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ShimmerWrap = (target: any, name: string, wrapper: (...args: any[]) => any) => void;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ShimmerUnwrap = (target: any, name: string) => void;

/**
 *
 * @param firestoreSupportedVersions - supported version of firebase/firestore
 * @param wrap - reference to native instrumentation wrap function
 * @param unwrap - reference to native instrumentation wrap function
 */
export function patchFirestore(
  firestoreSupportedVersions: string[],
  wrap: ShimmerWrap,
  unwrap: ShimmerUnwrap,
): InstrumentationNodeModuleDefinition {
  const moduleFirestoreCJS = new InstrumentationNodeModuleDefinition(
    '@firebase/firestore',
    firestoreSupportedVersions,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (moduleExports: any) => wrapMethods(moduleExports, wrap, unwrap),
  );
  const files: string[] = [
    '@firebase/firestore/dist/lite/index.node.cjs.js',
    '@firebase/firestore/dist/lite/index.node.mjs.js',
    '@firebase/firestore/dist/lite/index.rn.esm2017.js',
    '@firebase/firestore/dist/lite/index.cjs.js',
  ];

  for (const file of files) {
    moduleFirestoreCJS.files.push(
      new InstrumentationNodeModuleFile(
        file,
        firestoreSupportedVersions,
        moduleExports => wrapMethods(moduleExports, wrap, unwrap),
        moduleExports => unwrapMethods(moduleExports, unwrap),
      ),
    );
  }

  return moduleFirestoreCJS;
}

function wrapMethods(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  moduleExports: any,
  wrap: ShimmerWrap,
  unwrap: ShimmerUnwrap,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  unwrapMethods(moduleExports, unwrap);

  wrap(moduleExports, 'addDoc', patchAddDoc());
  wrap(moduleExports, 'getDocs', patchGetDocs());
  wrap(moduleExports, 'setDoc', patchSetDoc());
  wrap(moduleExports, 'deleteDoc', patchDeleteDoc());

  return moduleExports;
}

function unwrapMethods(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  moduleExports: any,
  unwrap: ShimmerUnwrap,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  for (const method of ['addDoc', 'getDocs', 'setDoc', 'deleteDoc']) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (isWrapped(moduleExports[method])) {
      unwrap(moduleExports, method);
    }
  }
  return moduleExports;
}

function patchAddDoc<AppModelType, DbModelType extends DocumentData>(): (
  original: AddDocType<AppModelType, DbModelType>,
) => (
  this: FirebaseInstrumentation,
  reference: CollectionReference<AppModelType, DbModelType>,
  data: WithFieldValue<AppModelType>,
) => Promise<DocumentReference<AppModelType, DbModelType>> {
  return function addDoc(original: AddDocType<AppModelType, DbModelType>) {
    return function (
      reference: CollectionReference<AppModelType, DbModelType>,
      data: WithFieldValue<AppModelType>,
    ): Promise<DocumentReference<AppModelType, DbModelType>> {
      return startFirestoreSpan('addDoc', reference, () => original(reference, data));
    };
  };
}

function patchDeleteDoc<AppModelType, DbModelType extends DocumentData>(): (
  original: DeleteDocType<AppModelType, DbModelType>,
) => (this: FirebaseInstrumentation, reference: DocumentReference<AppModelType, DbModelType>) => Promise<void> {
  return function deleteDoc(original: DeleteDocType<AppModelType, DbModelType>) {
    return function (reference: DocumentReference<AppModelType, DbModelType>): Promise<void> {
      return startFirestoreSpan('deleteDoc', reference.parent || reference, () => original(reference));
    };
  };
}

function patchGetDocs<AppModelType, DbModelType extends DocumentData>(): (
  original: GetDocsType<AppModelType, DbModelType>,
) => (
  this: FirebaseInstrumentation,
  reference: CollectionReference<AppModelType, DbModelType>,
) => Promise<QuerySnapshot<AppModelType, DbModelType>> {
  return function getDocs(original: GetDocsType<AppModelType, DbModelType>) {
    return function (
      reference: CollectionReference<AppModelType, DbModelType>,
    ): Promise<QuerySnapshot<AppModelType, DbModelType>> {
      return startFirestoreSpan('getDocs', reference, () => original(reference));
    };
  };
}

function patchSetDoc<AppModelType, DbModelType extends DocumentData>(): (
  original: SetDocType<AppModelType, DbModelType>,
) => (
  this: FirebaseInstrumentation,
  reference: DocumentReference<AppModelType, DbModelType>,
  data: WithFieldValue<AppModelType> & PartialWithFieldValue<AppModelType>,
  options?: SetOptions,
) => Promise<void> {
  return function setDoc(original: SetDocType<AppModelType, DbModelType>) {
    return function (
      reference: DocumentReference<AppModelType, DbModelType>,
      data: WithFieldValue<AppModelType> & PartialWithFieldValue<AppModelType>,
      options?: SetOptions,
    ): Promise<void> {
      return startFirestoreSpan('setDoc', reference.parent || reference, () => {
        return typeof options !== 'undefined' ? original(reference, data, options) : original(reference, data);
      });
    };
  };
}

function startFirestoreSpan<AppModelType, DbModelType extends DocumentData, T>(
  spanName: string,
  reference: CollectionReference<AppModelType, DbModelType> | DocumentReference<AppModelType, DbModelType>,
  callback: () => T,
): T {
  return startSpan(
    {
      name: `${spanName} ${reference.path}`,
      op: 'db.query',
      kind: SPAN_KIND.CLIENT,
      attributes: {
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.firebase.otel.firestore',
        [DB_OPERATION_NAME]: spanName,
        ...buildAttributes(reference),
      },
    },
    callback,
  );
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

function buildAttributes<AppModelType, DbModelType extends DocumentData>(
  reference: CollectionReference<AppModelType, DbModelType> | DocumentReference<AppModelType, DbModelType>,
): SpanAttributes {
  const firestoreApp: FirebaseApp = reference.firestore.app;
  const firestoreOptions: FirebaseOptions = firestoreApp.options;
  const json: { settings?: FirestoreSettings } = reference.firestore.toJSON() || {};
  const settings: FirestoreSettings = json.settings || {};

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
