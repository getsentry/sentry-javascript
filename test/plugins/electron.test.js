var electronPlugin = require('../../plugins/electron');

describe('React Native plugin', function () {

    describe('_normalizeData()', function () {

        it('default pathMatch', function () {
            var data = {
                culprit: 'file:///x/yy/zzz/Electron.app/Contents/app.asar/app.js',
                exception: {
                    values: [{
                        stacktrace: {
                            frames: [
                                {
                                    filename: 'file:///x/yy/zzz/Electron.app/Contents/app.asar/file1.js',
                                },
                                {
                                    filename: 'file:///x/yy/zzz/Electron.app/Contents/app.asar/file2.js',
                                }
                            ]
                        }
                    }],
                }
            };

            electronPlugin._normalizeData(data);

            assert.equal(data.culprit, 'app.js');

            var frames = data.exception.values[0].stacktrace.frames;
            assert.equal(frames[0].filename, 'file1.js');
            assert.equal(frames[1].filename, 'file2.js');
        });

        it('custom pathMatch', function () {
            var customPathMatch = /folder\/.+$/;
            var data = {
                culprit: 'file:///x/yy/zzz/Electron.app/Contents/app.asar/folder/app.js',
                exception: {
                    values: [{
                        stacktrace: {
                            frames: [
                                {
                                    filename: 'file:///x/yy/zzz/Electron.app/Contents/app.asar/folder/file1.js',
                                },
                                {
                                    filename: 'file:///x/yy/zzz/Electron.app/Contents/app.asar/folder/file2.js',
                                }
                            ]
                        }
                    }],
                }
            };

            electronPlugin._normalizeData(data, customPathMatch);

            assert.equal(data.culprit, 'folder/app.js');

            var frames = data.exception.values[0].stacktrace.frames;
            assert.equal(frames[0].filename, 'folder/file1.js');
            assert.equal(frames[1].filename, 'folder/file2.js');
        });

    });

});
