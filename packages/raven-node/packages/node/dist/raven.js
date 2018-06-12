"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var RavenNode = require("raven");
/** Casted raven instance with access to internal functions. */
// tslint:disable-next-line:variable-name
exports.Raven = RavenNode;
exports.HTTPSTransport = (_a = RavenNode
    .transports, _a.HTTPSTransport), exports.HTTPTransport = _a.HTTPTransport;
var _a;
//# sourceMappingURL=raven.js.map