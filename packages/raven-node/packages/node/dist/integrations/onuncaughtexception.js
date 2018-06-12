"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var raven_1 = require("../raven");
/** Global Promise Rejection handler */
var OnUncaughtException = /** @class */ (function () {
    function OnUncaughtException() {
        /**
         * @inheritDoc
         */
        this.name = 'OnUncaughtException';
    }
    /**
     * @inheritDoc
     */
    OnUncaughtException.prototype.install = function () {
        global.process.on('uncaughtException', raven_1.Raven.uncaughtErrorHandler.bind(raven_1.Raven));
    };
    return OnUncaughtException;
}());
exports.OnUncaughtException = OnUncaughtException;
//# sourceMappingURL=onuncaughtexception.js.map