export const _createNamedExportFrom = (obj, localName, importedName) => {
  exports[localName] = obj[importedName];
};
