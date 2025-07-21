import type { Span, Tracer } from '@opentelemetry/api';
import { context, diag, SpanKind, trace } from '@opentelemetry/api';
import {
  InstrumentationNodeModuleDefinition,
  InstrumentationNodeModuleFile,
  isWrapped,
  safeExecuteInTheMiddle,
} from '@opentelemetry/instrumentation';
import {
  ATTR_DB_COLLECTION_NAME,
  ATTR_DB_NAMESPACE,
  ATTR_DB_OPERATION_NAME,
  ATTR_DB_SYSTEM_NAME,
  ATTR_SERVER_ADDRESS,
  ATTR_SERVER_PORT,
} from '@opentelemetry/semantic-conventions';
import type { SpanAttributes } from '@sentry/core';
import type { unwrap as shimmerUnwrap, wrap as shimmerWrap } from 'shimmer';
import type { FirebaseInstrumentation } from '../firebaseInstrumentation';
import type {
  AddDocType,
  CollectionReference,
  DeleteDocType,
  DocumentData,
  DocumentReference,
  FirebaseApp,
  FirebaseInstrumentationConfig,
  FirebaseOptions,
  FirestoreSettings,
  FirestoreSpanCreationHook,
  GetDocsType,
  PartialWithFieldValue,
  QuerySnapshot,
  SetDocType,
  SetOptions,
  WithFieldValue,
} from '../types';

/**
 *
 * @param tracer - Opentelemetry Tracer
 * @param firestoreSupportedVersions - supported version of firebase/firestore
 * @param wrap - reference to native instrumentation wrap function
 * @param unwrap - reference to native instrumentation wrap function
 */
export function patchFirestore(
  tracer: Tracer,
  firestoreSupportedVersions: string[],
  wrap: typeof shimmerWrap,
  unwrap: typeof shimmerUnwrap,
  config: FirebaseInstrumentationConfig,
): InstrumentationNodeModuleDefinition {
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  const defaultFirestoreSpanCreationHook: FirestoreSpanCreationHook = () => {};

  let firestoreSpanCreationHook: FirestoreSpanCreationHook = defaultFirestoreSpanCreationHook;
  const configFirestoreSpanCreationHook = config.firestoreSpanCreationHook;

  if (typeof configFirestoreSpanCreationHook === 'function') {
    firestoreSpanCreationHook = (span: Span) => {
      safeExecuteInTheMiddle(
        () => configFirestoreSpanCreationHook(span),
        error => {
          if (!error) {
            return;
          }
          diag.error(error?.message);
        },
        true,
      );
    };
  }

  const moduleFirestoreCJS = new InstrumentationNodeModuleDefinition(
    '@firebase/firestore',
    firestoreSupportedVersions,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (moduleExports: any) => wrapMethods(moduleExports, wrap, unwrap, tracer, firestoreSpanCreationHook),
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
        moduleExports => wrapMethods(moduleExports, wrap, unwrap, tracer, firestoreSpanCreationHook),
        moduleExports => unwrapMethods(moduleExports, unwrap),
      ),
    );
  }

  return moduleFirestoreCJS;
}

function wrapMethods(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  moduleExports: any,
  wrap: typeof shimmerWrap,
  unwrap: typeof shimmerUnwrap,
  tracer: Tracer,
  firestoreSpanCreationHook: FirestoreSpanCreationHook,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  unwrapMethods(moduleExports, unwrap);

  wrap(moduleExports, 'addDoc', patchAddDoc(tracer, firestoreSpanCreationHook));
  wrap(moduleExports, 'getDocs', patchGetDocs(tracer, firestoreSpanCreationHook));
  wrap(moduleExports, 'setDoc', patchSetDoc(tracer, firestoreSpanCreationHook));
  wrap(moduleExports, 'deleteDoc', patchDeleteDoc(tracer, firestoreSpanCreationHook));

  return moduleExports;
}

function unwrapMethods(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  moduleExports: any,
  unwrap: typeof shimmerUnwrap,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  for (const method of ['addDoc', 'getDocs', 'setDoc', 'deleteDoc']) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (isWrapped(moduleExports[method])) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      unwrap(moduleExports, method);
    }
  }
  return moduleExports;
}

function patchAddDoc<AppModelType, DbModelType extends DocumentData>(
  tracer: Tracer,
  firestoreSpanCreationHook: FirestoreSpanCreationHook,
): (
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
      const span = startDBSpan(tracer, 'addDoc', reference);
      firestoreSpanCreationHook(span);
      return executeContextWithSpan<Promise<DocumentReference<AppModelType, DbModelType>>>(span, () => {
        return original(reference, data);
      });
    };
  };
}

function patchDeleteDoc<AppModelType, DbModelType extends DocumentData>(
  tracer: Tracer,
  firestoreSpanCreationHook: FirestoreSpanCreationHook,
): (
  original: DeleteDocType<AppModelType, DbModelType>,
) => (this: FirebaseInstrumentation, reference: DocumentReference<AppModelType, DbModelType>) => Promise<void> {
  return function deleteDoc(original: DeleteDocType<AppModelType, DbModelType>) {
    return function (reference: DocumentReference<AppModelType, DbModelType>): Promise<void> {
      const span = startDBSpan(tracer, 'deleteDoc', reference.parent || reference);
      firestoreSpanCreationHook(span);
      return executeContextWithSpan<Promise<void>>(span, () => {
        return original(reference);
      });
    };
  };
}

function patchGetDocs<AppModelType, DbModelType extends DocumentData>(
  tracer: Tracer,
  firestoreSpanCreationHook: FirestoreSpanCreationHook,
): (
  original: GetDocsType<AppModelType, DbModelType>,
) => (
  this: FirebaseInstrumentation,
  reference: CollectionReference<AppModelType, DbModelType>,
) => Promise<QuerySnapshot<AppModelType, DbModelType>> {
  return function getDocs(original: GetDocsType<AppModelType, DbModelType>) {
    return function (
      reference: CollectionReference<AppModelType, DbModelType>,
    ): Promise<QuerySnapshot<AppModelType, DbModelType>> {
      const span = startDBSpan(tracer, 'getDocs', reference);
      firestoreSpanCreationHook(span);
      return executeContextWithSpan<Promise<QuerySnapshot<AppModelType, DbModelType>>>(span, () => {
        return original(reference);
      });
    };
  };
}

function patchSetDoc<AppModelType, DbModelType extends DocumentData>(
  tracer: Tracer,
  firestoreSpanCreationHook: FirestoreSpanCreationHook,
): (
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
      const span = startDBSpan(tracer, 'setDocs', reference.parent || reference);
      firestoreSpanCreationHook(span);

      return executeContextWithSpan<Promise<void>>(span, () => {
        return typeof options !== 'undefined' ? original(reference, data, options) : original(reference, data);
      });
    };
  };
}

function executeContextWithSpan<T>(span: Span, callback: () => T): T {
  return context.with(trace.setSpan(context.active(), span), () => {
    return safeExecuteInTheMiddle(
      (): T => {
        return callback();
      },
      err => {
        if (err) {
          span.recordException(err);
        }
        span.end();
      },
      true,
    );
  });
}

function startDBSpan<AppModelType, DbModelType extends DocumentData>(
  tracer: Tracer,
  spanName: string,
  reference: CollectionReference<AppModelType, DbModelType> | DocumentReference<AppModelType, DbModelType>,
): Span {
  const span = tracer.startSpan(`${spanName} ${reference.path}`, { kind: SpanKind.CLIENT });
  addAttributes(span, reference);
  span.setAttribute(ATTR_DB_OPERATION_NAME, spanName);
  return span;
}

function addAttributes<AppModelType, DbModelType extends DocumentData>(
  span: Span,
  reference: CollectionReference<AppModelType, DbModelType> | DocumentReference<AppModelType, DbModelType>,
): void {
  const firestoreApp: FirebaseApp = reference.firestore.app;
  const firestoreOptions: FirebaseOptions = firestoreApp.options;
  const json: { settings?: FirestoreSettings } = reference.firestore.toJSON() || {};
  const settings: FirestoreSettings = json.settings || {};

  const attributes: SpanAttributes = {
    [ATTR_DB_COLLECTION_NAME]: reference.path,
    [ATTR_DB_NAMESPACE]: firestoreApp.name,
    [ATTR_DB_SYSTEM_NAME]: 'firebase.firestore',
    'firebase.firestore.type': reference.type,
    'firebase.firestore.options.projectId': firestoreOptions.projectId,
    'firebase.firestore.options.appId': firestoreOptions.appId,
    'firebase.firestore.options.messagingSenderId': firestoreOptions.messagingSenderId,
    'firebase.firestore.options.storageBucket': firestoreOptions.storageBucket,
  };

  if (typeof settings.host === 'string') {
    const arr = settings.host.split(':');
    if (arr.length === 2) {
      attributes[ATTR_SERVER_ADDRESS] = arr[0];
      attributes[ATTR_SERVER_PORT] = arr[1];
    }
  }

  span.setAttributes(attributes);
}
