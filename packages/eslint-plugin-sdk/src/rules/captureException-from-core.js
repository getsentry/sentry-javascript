/**
 * Force all internal use of `captureException` to come from `@sentry/core` rather than `@sentry/browser`,
 * `@sentry/node`, or any wrapper SDK, in order to prevent accidental inclusion of manual-usage mechansism values.
 *
 * TODO (maybe): Doesn't catch unpacking of the module object (code like
 *
 *   `import * as Sentry from '@sentry/xxx'; const { captureException } = Sentry; captureException(...);`
 *
 * ) because it's unlikely we'd do that and the rule would probably be more complicated than it's worth. (There are
 * probably other strange ways to call the wrong version of `captureException`, and this rule doesn't catch those,
 * either, but again, unlikely to come up in real life.)
 */

// let hasPrinted = false;

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Enforce internal usage of `captureException` from `@sentry/core`',
    },
    messages: {
      errorMessage:
        'All internal uses of `captureException` should come directly from `@sentry/core`, not from the browser or node SDKs (or any of their wrappers), nor from the results of a `getCurrentHub()` or `getClient()` call. (The browser and node versions of `captureException`, as well as the versions living in the `Hub` and `BaseClient` classes, have manual-capture `mechanism` data baked in, which is probably not what you want.)',
    },
  },

  create: function (context) {
    return {
      // This catches imports of the form `import { captureException } from '@sentry/xxx';`
      ImportDeclaration: function (node) {
        if (
          node.specifiers.some(
            specifier =>
              specifier.type === 'ImportSpecifier' &&
              specifier.imported.type === 'Identifier' &&
              specifier.imported.name === 'captureException',
          ) &&
          node.source.value !== '@sentry/core'
        ) {
          context.report({ node, messageId: 'errorMessage' });
        }
      },

      // Places where we're calling `captureException()`
      CallExpression: function (node) {
        // Bare `captureException` calls, where `captureException` was imported from somewhere other than `@sentry/core`
        if (node.callee.type === 'Identifier' && node.callee.name === 'captureException') {
          // const captureExceptionVariable = context
          //   .getScope()
          //   .variables.find(variable => variable.name === 'captureException');

          const captureExceptionDefinitions = getDefinitions('captureException', context);

          const captureExceptionDefinitionFromImport =
            captureExceptionDefinitions && captureExceptionDefinitions.find(def => def.type === 'ImportBinding');

          // const definitionAsImport = captureExceptionVariable.defs.find(def => def.type === 'ImportBinding');
          // const captureExceptionDefinitionFromImport = getDefinitions('captureException', context).find(
          //   def => def.type === 'ImportBinding',
          // );

          if (
            captureExceptionDefinitionFromImport &&
            captureExceptionDefinitionFromImport.parent.source.value !== '@sentry/core'
          ) {
            context.report({ node, messageId: 'errorMessage' });
          }
        }

        // Calls of the form `someName.captureException()`, where `someName` was imported from somewhere other than `@sentry/core`
        if (
          node.callee.type === 'MemberExpression' &&
          node.callee.object.type === 'Identifier' && // the `someName` part of `someName.captureException`
          node.callee.property.name === 'captureException'
        ) {
          const objectDefinitions = getDefinitions(node.callee.object.name, context);

          const objectDefinitionFromImport =
            objectDefinitions && objectDefinitions.find(def => def.type === 'ImportBinding');

          if (objectDefinitionFromImport && objectDefinitionFromImport.parent.source.value !== '@sentry/core') {
            context.report({ node, messageId: 'errorMessage' });
          }
        }

        // Calls of the form `someName.captureException()`, where `someName` is something other than an import (likely
        // comething like `hub.captureException()` or `client.captureException()`)
        if (
          node.callee.type === 'MemberExpression' &&
          node.callee.object.type === 'Identifier' && // the `someName` part of `someName.captureException`
          node.callee.property.name === 'captureException'
        ) {
          const objectDefinitions = getDefinitions(node.callee.object.name, context);

          const objectDefinitionFromImport =
            objectDefinitions && objectDefinitions.find(def => def.type === 'ImportBinding');

          if (!objectDefinitionFromImport) {
            context.report({ node, messageId: 'errorMessage' });
          }
        }

        // Calls of the form `<someExpression>.captureException()`
        if (
          node.callee.type === 'MemberExpression' &&
          node.callee.object.type !== 'Identifier' && // the `someName` part of `someName.captureException`
          node.callee.property.name === 'captureException'
        ) {
          context.report({ node, messageId: 'errorMessage' });
        }

        // // This checks for `import * as SomeName from '@sentry/core'; SomeName.captureException(...);`. Anytyhing else (things like `getCurrentHub().captureException(...)` and `getCurrentHub().getClient().captureException(...)` will not match and will trigger the error.)
        // if (!isCoreDotCaptureException(node, context)) {
        //   context.report({ node, messageId: 'errorMessage' });
        // }
      },
    };
  },
};

// // This matches uses like `import * as SomeName from '@sentry/core'; SomeName.captureException(...);`. (We catch `import { captureException } from '@sentry/core';` elsewhere.)
// function isCoreDotCaptureException(node, context) {
//   // Note: In an expression like `xxx.captureException()`:
//   //     - The whole thing is a `CallExpression`
//   //     - The `xxx.captureException` is a `MemberExpression`
//   //     - The `xxx` is the `object`
//   //     - The `captureException` is the `property`
//   if (
//     node.type === 'CallExpression' &&
//     node.callee.type === 'MemberExpression' &&
//     node.callee.object.type === 'Identifier' &&
//     node.callee.property.name === 'captureException'
//   ) {
//     const objectName = node.callee.object.name;
//
//     // All statements defining the object. (Not entirely clear how there there could be more than one, but
//     // ¯\_(ツ)_/¯. Note: When we find a reference to the object, it may or may not be the reference in
//     // `Sentry.captureException`, but we don't care, because we just want to use it to jump back to the original
//     // definition.)
//     const objectDefinitions = context
//       .getScope()
//       .references.find(reference => reference.identifier && reference.identifier.name === objectName).resolved.defs;
//
//     // Of the definitions, one which comes as part of an import, if any
//     const namespaceImportDef = objectDefinitions.find(definition => definition.type === 'ImportBinding');
//
//     if (
//       namespaceImportDef &&
//       namespaceImportDef.parent.type === 'ImportDeclaration' &&
//       namespaceImportDef.parent.source.value === '@sentry/core'
//     ) {
//       return true;
//     }
//   }
//
//   return false;
// }

// Get nodes defining the variable with the given name in the given scope (scope is retrieved from `context`)
function getDefinitions(name, context) {
  // This is any reference to the name in the current scope, not necessarily the current one, but they must all lead back to the same definition, so it doesn't matter.
  const referenceToName = context
    .getScope()
    .references.find(reference => reference.identifier && reference.identifier.name === name);

  return referenceToName && referenceToName.resolved && referenceToName.resolved.defs;
}

// // Get nodes which define things with the given name
// function getDefinitions(name, context) {
//   // This is all references to anything in the scope with the given name
//   const matchingReferences = context
//     .getScope()
//     .references.filter(reference => reference.identifier && reference.identifier.name === name);
//
//   return matchingReferences && matchingReferences.map(ref => ref.resolved.defs);
// }
//
// function isModuleObject(node, context) {
//   if (node.type === 'Identifier') {
//     // This is the name of the object. IOW, it's the `Sentry` in `Sentry.captureException`.
//     const objectName = node.callee.object.name;
//
//     // All statements defining the object. (Not entirely clear how there there could be more than one, but
//     // ¯\_(ツ)_/¯. Note: When we find a reference to the object, it may or may not be the reference in
//     // `Sentry.captureException`, but we don't care, because we just want to use it to jump back to the original
//     // definition.)
//     const objectDefinitions = context
//       .getScope()
//       .references.find(reference => reference.identifier && reference.identifier.name === objectName).resolved.defs;
//
//     // Of the definitions, one which comes as part of an import, if any
//     const namespaceImportDef = objectDefinitions.find(definition => definition.type === 'ImportBinding');
//
//     return namespaceImportDef !== undefined;
//   }
// }
