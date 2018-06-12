"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var fs_1 = require("fs");
var path_1 = require("path");
var fs_2 = require("./fs");
/**
 * Lazily serializes data to a JSON file to persist. When created, it loads data
 * from that file if it already exists.
 */
var Store = /** @class */ (function () {
    /**
     * Creates a new store.
     *
     * @param path A unique filename to store this data.
     * @param id A unique filename to store this data.
     * @param initial An initial value to initialize data with.
     */
    function Store(path, id, initial) {
        this.path = path_1.join(path, id + ".json");
        this.initial = initial;
        this.flushing = false;
    }
    /**
     * Updates data by replacing it with the given value.
     * @param next New data to replace the previous one.
     */
    Store.prototype.set = function (next) {
        var _this = this;
        this.data = next;
        if (!this.flushing) {
            this.flushing = true;
            setImmediate(function () {
                _this.flush();
            });
        }
    };
    /**
     * Updates data by passing it through the given function.
     * @param fn A function receiving the current data and returning new one.
     */
    Store.prototype.update = function (fn) {
        this.set(fn(this.get()));
    };
    /**
     * Returns the current data.
     *
     * When invoked for the first time, it will try to load previously stored data
     * from disk. If the file does not exist, the initial value provided to the
     * constructor is used.
     */
    Store.prototype.get = function () {
        if (this.data === undefined) {
            try {
                this.data = fs_1.existsSync(this.path)
                    ? JSON.parse(fs_1.readFileSync(this.path, 'utf8'))
                    : this.initial;
            }
            catch (e) {
                this.data = this.initial;
            }
        }
        return this.data;
    };
    /** Returns store to its initial state */
    Store.prototype.clear = function () {
        this.set(this.initial);
    };
    /** Serializes the current data into the JSON file. */
    Store.prototype.flush = function () {
        try {
            fs_2.mkdirpSync(path_1.dirname(this.path));
            fs_1.writeFileSync(this.path, JSON.stringify(this.data));
        }
        catch (e) {
            // This usually fails due to anti virus scanners, issues in the file
            // system, or problems with network drives. We cannot fix or handle this
            // issue and must resume gracefully. Thus, we have to ignore this error.
        }
        finally {
            this.flushing = false;
        }
    };
    return Store;
}());
exports.Store = Store;
//# sourceMappingURL=store.js.map