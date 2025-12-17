const packageJson = require('../package.json');
const nextjsVersion = packageJson.dependencies.next;
const nextjsMajor = Number(nextjsVersion.split('.')[0]);

export const isNext13 = !isNaN(nextjsMajor) && nextjsMajor === 13;
export const nextjsMajorVersion = nextjsMajor;
