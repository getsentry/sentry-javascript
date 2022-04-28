export const _createStarExport = obj => {
  Object.keys(obj)
    .filter(key => key !== 'default' && key !== '__esModule')
    .forEach(key => {
      // eslint-disable-next-line no-prototype-builtins
      if (exports.hasOwnProperty(key)) {
        return;
      }
      exports[key] = obj[key];
    });
};
