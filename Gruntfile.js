'use strict';

module.exports = function(grunt) {
    var _ = require('lodash');
    var path = require('path');
    var through = require('through2');
    var proxyquire = require('proxyquireify');
    var versionify = require('browserify-versionify');

    var excludedPlugins = [
        'react-native'
    ];

    var plugins = grunt.option('plugins');
    // Create plugin paths and verify they exist
    plugins = _.map(plugins ? plugins.split(',') : [], function (plugin) {
        var p = 'plugins/' + plugin + '.js';

        if(!grunt.file.exists(p))
            throw new Error("Plugin '" + plugin + "' not found in plugins directory.");

        return p;
    });

    // custom browserify transformer to re-write plugins to
    // self-register with Raven via addPlugin
    function AddPluginBrowserifyTransformer() {
        return function (file) {
            return through(function (buf, enc, next) {
                buf = buf.toString('utf8');
                if (/plugins/.test(file)) {
                    buf += "\nrequire('../src/singleton').addPlugin(module.exports);";
                }
                this.push(buf);
                next();
            });
        };
    }

    // Taken from http://dzone.com/snippets/calculate-all-combinations
    var combine = function (a) {
        var fn = function (n, src, got, all) {
            if (n === 0) {
                all.push(got);
                return;
            }

            for (var j = 0; j < src.length; j++) {
                fn(n - 1, src.slice(j + 1), got.concat([src[j]]), all);
            }
        };

        var excluded = _.map(excludedPlugins, function(plugin) {
            return 'plugins/' + plugin + '.js';
        });

        // Remove the plugins that we don't want to build
        a = _.filter(a, function(n) {
            return excluded.indexOf(n) === -1;
        });

        var all = [a];

        for (var i = 0; i < a.length; i++) {
            fn(i, a, [], all);
        }

        return all;
    };

    var pluginCombinations = combine(grunt.file.expand('plugins/*.js'));
    var pluginConcatFiles = _.reduce(pluginCombinations, function (dict, comb) {
        var key = _.map(comb, function (plugin) {
            return path.basename(plugin, '.js');
        });
        key.sort();

        var dest = path.join('build/', key.join(','), '/raven.js');
        dict[dest] = ['src/singleton.js'].concat(comb);

        return dict;
    }, {});

    var gruntConfig = {
        pkg: grunt.file.readJSON('package.json'),
        aws: grunt.file.exists('aws.json') ? grunt.file.readJSON('aws.json'): {},

        clean: ['build'],

        browserify: {
            options: {
                banner: grunt.file.read('template/_copyright.js'),
                browserifyOptions: {
                    standalone: 'Raven' // umd

                },
                transform: [versionify]
            },
            core: {
                src: 'src/singleton.js',
                dest: 'build/raven.js'
            },
            plugins: {
                files: pluginConcatFiles,
                options: {
                    transform: [
                        [ versionify ],
                        [ new AddPluginBrowserifyTransformer() ]
                    ]
                }
            },
            test: {
                src: 'test/**/*.test.js',
                dest: 'build/raven.test.js',
                options: {
                    browserifyOptions: {
                        debug: true // source maps
                    },
                    plugin: [proxyquire.plugin]
                }
            }
        },

        uglify: {
            options: {
                sourceMap: function (dest) {
                    return path.join(path.dirname(dest),
                                     path.basename(dest, '.js')) +
                           '.map';
                },
                sourceMappingURL: function (dest) {
                    return path.basename(dest, '.js') + '.map';
                },
                // Only preserve comments that start with (!)
                preserveComments: /^!/,
                compress: {
                    dead_code: true,
                    global_defs: {
                        'TEST': false
                    }
                }
            },
            dist: {
                src: ['build/**/*.js'],
                ext: '.min.js',
                expand: true
            }
        },

        fixSourceMaps: {
            all: ['build/**/*.map']
        },

        eslint: {
            target: ['Gruntfile.js', 'src/**/*.js', 'plugins/**/*.js']
        },

        mocha: {
            options: {
                mocha: {
                    ignoreLeaks: true,
                    grep:        grunt.option('grep')
                },
                log:      true,
                reporter: 'Dot',
                run:      true
            },
            unit: {
                src: ['test/index.html'],
                nonull: true
            },
            integration: {
                src: ['test/integration/index.html'],
                nonull: true
            }
        },

        release: {
            options: {
                npm:           false,
                commitMessage: 'Release <%= version %>'
            }
        },

        s3: {
            options: {
                key: '<%= aws.key %>',
                secret: '<%= aws.secret %>',
                bucket: '<%= aws.bucket %>',
                access: 'public-read',
                // Limit concurrency
                maxOperations: 20,
                headers: {
                    // Surrogate-Key header for Fastly to purge by release
                    'x-amz-meta-surrogate-key': '<%= pkg.release %>'
                }
            },
            all: {
                upload: [{
                    src: 'build/**/*',
                    dest: '<%= pkg.release %>/',
                    rel: 'build/'
                }]
            }
        },

        connect: {
            test: {
                options: {
                    port: 8000,
                    debug: true,
                    keepalive: true
                }
            },

            docs: {
                options: {
                    port: 8000,
                    debug: true,
                    base: 'docs/_build/html',
                    keepalive: true
                }
            }
        },

        copy: {
            dist: {
                expand: true,
                flatten: true,
                cwd: 'build/',
                src: '**',
                dest: 'dist/'
            }
        },

        sri: {
            dist: {
                src: ['dist/*.js'],
                options: {
                    dest: 'dist/sri.json',
                    pretty: true
                }
            },
            build: {
                src: ['build/**/*.js'],
                options: {
                    dest: 'build/sri.json',
                    pretty: true
                }
            }
        }
    };

    grunt.initConfig(gruntConfig);

    // Custom Grunt tasks
    grunt.registerTask('version', function() {
        var pkg = grunt.config.get('pkg');
        if (grunt.option('dev')) {
            pkg.release = 'dev';
            pkg.version = grunt.config.get('gitinfo').local.branch.current.shortSHA;
        } else {
            pkg.release = pkg.version;
        }
        grunt.config.set('pkg', pkg);
    });

    grunt.registerMultiTask('fixSourceMaps', function () {
        this.files.forEach(function (f) {
            f.src.filter(function (filepath) {
                if (!grunt.file.exists(filepath)) {
                    grunt.log.warn('Source file "' + filepath + '" not found.');
                    return false;
                } else {
                    return true;
                }
            }).forEach(function (filepath) {
                var base = path.dirname(filepath);
                var sMap = grunt.file.readJSON(filepath);
                sMap.file = path.relative(base, sMap.file);
                sMap.sources = _.map(sMap.sources, path.relative.bind(path, base));

                grunt.file.write(filepath, JSON.stringify(sMap));
                // Print a success message.
                grunt.log.writeln('File "' + filepath + '" fixed.');
            });
        });
    });

    // Grunt contrib tasks
    grunt.loadNpmTasks('grunt-contrib-uglify');
    grunt.loadNpmTasks('grunt-contrib-clean');
    grunt.loadNpmTasks('grunt-contrib-connect');
    grunt.loadNpmTasks('grunt-contrib-copy');

    // 3rd party Grunt tasks
    grunt.loadNpmTasks('grunt-browserify');
    grunt.loadNpmTasks('grunt-mocha');
    grunt.loadNpmTasks('grunt-release');
    grunt.loadNpmTasks('grunt-s3');
    grunt.loadNpmTasks('grunt-gitinfo');
    grunt.loadNpmTasks('grunt-sri');
    grunt.loadNpmTasks('grunt-eslint');

    // Build tasks
    grunt.registerTask('_prep', ['clean', 'gitinfo', 'version']);
    grunt.registerTask('browserify.core', ['_prep', 'browserify:core']);
    grunt.registerTask('browserify.plugins', ['_prep', 'browserify:plugins']);
    grunt.registerTask('build.test', ['_prep', 'browserify:test']);
    grunt.registerTask('build.core', ['browserify.core', 'uglify', 'fixSourceMaps', 'sri:dist']);
    grunt.registerTask('build.all', ['browserify.plugins', 'uglify', 'fixSourceMaps', 'sri:dist', 'sri:build']);
    grunt.registerTask('build', ['build.all']);
    grunt.registerTask('dist', ['build.core', 'copy:dist']);

    // Test task
    grunt.registerTask('test', ['eslint', 'browserify.core', 'browserify:test', 'mocha']);

    // Webserver tasks
    grunt.registerTask('run:test', ['connect:test']);
    grunt.registerTask('run:docs', ['connect:docs']);

    grunt.registerTask('publish', ['test', 'build.all', 's3']);
    grunt.registerTask('default', ['test']);
};
