"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = y[op[0] & 2 ? "return" : op[0] ? "throw" : "next"]) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [0, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var fs_1 = require("fs");
var path_1 = require("path");
var _0777 = parseInt('0777', 8);
/**
 * Asynchronously creates the given directory.
 *
 * @param path A relative or absolute path to the directory.
 * @param mode The permission mode.
 * @returns A Promise that resolves when the path has been created.
 */
function mkdirAsync(path, mode) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            // We cannot use util.promisify here because that was only introduced in Node
            // 8 and we need to support older Node versions.
            return [2 /*return*/, new Promise(function (res, reject) {
                    fs_1.mkdir(path, mode, function (err) {
                        if (err) {
                            reject(err);
                        }
                        else {
                            res();
                        }
                    });
                })];
        });
    });
}
/**
 * Recursively creates the given path.
 *
 * @param path A relative or absolute path to create.
 * @returns A Promise that resolves when the path has been created.
 */
function mkdirp(path) {
    return __awaiter(this, void 0, void 0, function () {
        var mode, realPath, err_1, error;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    mode = _0777 & ~process.umask();
                    realPath = path_1.resolve(path);
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 2, , 6]);
                    return [2 /*return*/, mkdirAsync(realPath, mode)];
                case 2:
                    err_1 = _a.sent();
                    error = err_1;
                    if (!(error && error.code === 'ENOENT')) return [3 /*break*/, 4];
                    return [4 /*yield*/, mkdirp(path_1.dirname(realPath))];
                case 3:
                    _a.sent();
                    return [2 /*return*/, mkdirAsync(realPath, mode)];
                case 4:
                    try {
                        if (!fs_1.statSync(realPath).isDirectory()) {
                            throw err_1;
                        }
                    }
                    catch (_) {
                        throw err_1;
                    }
                    _a.label = 5;
                case 5: return [3 /*break*/, 6];
                case 6: return [2 /*return*/];
            }
        });
    });
}
exports.mkdirp = mkdirp;
/**
 * Synchronous version of {@link mkdirp}.
 *
 * @param path A relative or absolute path to create.
 */
function mkdirpSync(path) {
    // tslint:disable-next-line:no-bitwise
    var mode = _0777 & ~process.umask();
    var realPath = path_1.resolve(path);
    try {
        fs_1.mkdirSync(realPath, mode);
    }
    catch (err) {
        var error = err;
        if (error && error.code === 'ENOENT') {
            mkdirpSync(path_1.dirname(realPath));
            fs_1.mkdirSync(realPath, mode);
        }
        else {
            try {
                if (!fs_1.statSync(realPath).isDirectory()) {
                    throw err;
                }
            }
            catch (_) {
                throw err;
            }
        }
    }
}
exports.mkdirpSync = mkdirpSync;
//# sourceMappingURL=fs.js.map