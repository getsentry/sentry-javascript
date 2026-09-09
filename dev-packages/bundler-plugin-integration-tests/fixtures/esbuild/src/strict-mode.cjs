"use strict";

globalThis.strictModePreserved =
  (function () {
    return this;
  })() === undefined;
