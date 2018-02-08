'use strict'; // eslint-disable-line
module.exports = function(grunt) {
  var path = require('path');
  var os = require('os');

  var excludedPlugins = ['react-native'];

  var plugins = grunt.file.expand('plugins/*.js').filter(function(plugin) {
    var pluginName = path.basename(plugin, '.js');

    return excludedPlugins.indexOf(pluginName) === -1;
  });

  // These files are generated with the 'generate:plugins-combined' npm script
  var pluginCombinations = grunt.file.expand('plugins/combinations/*.js');

  var tests = grunt.file.expand('test/**/*.test.js');

  var rollupConfig = {
    core: {
      options: [
        {
          input: {
            input: 'src/singleton.js'
          },
          output: {
            file: 'build/raven.js',
            name: 'Raven',
            banner: grunt.file.read('template/_copyright.js')
          }
        }
      ]
    },
    plugins: {
      options: []
    },
    pluginCombinations: {
      options: []
    },
    tests: {
      options: []
    }
  };

  // Create a dedicated entry in rollup config for each individual
  // plugin (each needs a unique `standalone` config)
  plugins.forEach(function(plugin) {
    var name = plugin
      .replace(/.*\//, '') // everything before slash
      .replace('.js', ''); // extension
    var capsName = name.charAt(0).toUpperCase() + name.slice(1);
    var config = {
      input: {
        input: plugin
      },
      output: {
        file: path.join('build', 'plugins', path.basename(plugin)),
        name: 'Raven.Plugins.' + capsName,
        banner: grunt.file.read('template/_copyright.js')
      }
    };

    rollupConfig.plugins.options.push(config);
  });

  // Create a dedicated entry in rollup config for each individual plugin combination
  pluginCombinations.forEach(function(pluginCombination) {
    var config = {
      input: {
        input: pluginCombination
      },
      output: {
        file: path.join('build', path.basename(pluginCombination, '.js'), 'raven.js'),
        name: 'Raven',
        banner: grunt.file.read('template/_copyright.js')
      }
    };

    rollupConfig.pluginCombinations.options.push(config);
  });

  // Transpile all test scripts
  tests.forEach(function(test) {
    var config = {
      input: {
        input: test
      },
      output: {
        file: path.join('build', path.basename(test)),
        name: path.basename(test, '.js')
      }
    };

    rollupConfig.tests.options.push(config);
  });

  var awsConfigPath = path.join(os.homedir(), '.aws', 'raven-js.json');
  var gruntConfig = {
    pkg: grunt.file.readJSON('package.json'),
    aws: grunt.file.exists(awsConfigPath) ? grunt.file.readJSON(awsConfigPath) : {},

    clean: ['build', 'plugins/combinations'],

    rollup: rollupConfig,

    uglify: {
      options: {
        sourceMap: true,

        // Only preserve comments that start with (!)
        preserveComments: /^!/,

        // Minify object properties that begin with _ ("private"
        // methods and values)
        mangleProperties: {
          regex: /^_/
        },

        compress: {
          booleans: true,
          conditionals: true,
          dead_code: true,
          join_vars: true,
          pure_getters: true,
          sequences: true,
          unused: true,

          global_defs: {
            __DEV__: false
          }
        }
      },
      dist: {
        src: ['build/**/*.js'],
        ext: '.min.js',
        expand: true
      }
    },

    release: {
      options: {
        npm: false,
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
        upload: [
          {
            src: 'build/**/*',
            dest: '<%= pkg.release %>/',
            rel: 'build/'
          }
        ]
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
        flatten: false,
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
  grunt.registerMultiTask('rollup', 'Create the bundles', function() {
    var build = require('./scripts/build');
    var options = this.options();
    var done = this.async();

    var promises = Object.keys(options).map(function(key) {
      return build(options[key].input, options[key].output);
    });

    Promise.all(promises)
      .then(function() {
        done();
      })
      ['catch'](function(error) {
        grunt.fail.warn(error);
      });
  });

  grunt.registerTask('generate-plugin-combinations', function() {
    var dest = './plugins/combinations';
    grunt.file.mkdir(dest);
    require('./scripts/generate-plugin-combinations')(plugins, dest);
  });

  grunt.registerTask('version', function() {
    var pkg = grunt.config.get('pkg');

    // Verify version string in source code matches what's in package.json
    var Raven = require('./src/raven');
    if (Raven.prototype.VERSION !== pkg.version) {
      return grunt.util.error(
        'Mismatched version in src/raven.js: ' +
          Raven.prototype.VERSION +
          ' (should be ' +
          pkg.version +
          ')'
      );
    }

    if (grunt.option('dev')) {
      pkg.release = 'dev';
    } else {
      pkg.release = pkg.version;
    }
    grunt.config.set('pkg', pkg);
  });

  grunt.registerTask('config:ci', 'Verify CI config', function() {
    if (!process.env.SAUCE_USERNAME)
      console.warn('No SAUCE_USERNAME env variable defined.');
    if (!process.env.SAUCE_ACCESS_KEY)
      console.warn('No SAUCE_ACCESS_KEY env variable defined.');
    if (!process.env.SAUCE_USERNAME || !process.env.SAUCE_ACCESS_KEY) process.exit(1);
  });

  // Grunt contrib tasks
  grunt.loadNpmTasks('grunt-contrib-uglify');
  grunt.loadNpmTasks('grunt-contrib-clean');
  grunt.loadNpmTasks('grunt-contrib-connect');
  grunt.loadNpmTasks('grunt-contrib-copy');

  // 3rd party Grunt tasks
  grunt.loadNpmTasks('grunt-release');
  grunt.loadNpmTasks('grunt-s3');
  grunt.loadNpmTasks('grunt-gitinfo');
  grunt.loadNpmTasks('grunt-sri');

  // Build tasks
  grunt.registerTask('_prep', ['gitinfo', 'version']);
  grunt.registerTask('build.test', ['_prep', 'rollup:core', 'rollup:tests']);
  grunt.registerTask('build.core', ['_prep', 'rollup:core']);
  grunt.registerTask('build.plugins', [
    '_prep',
    'generate-plugin-combinations',
    'rollup:plugins',
    'rollup:pluginCombinations',
    'sri:build'
  ]);
  grunt.registerTask('build', ['build.core', 'build.plugins', 'uglify']);

  grunt.registerTask('dist', ['clean', 'build', 'copy:dist', 'sri:dist']);

  // Test tasks
  grunt.registerTask('test:ci', ['config:ci', 'build:test']);

  // Webserver tasks
  grunt.registerTask('run:test', ['build.test', 'connect:test']);
  grunt.registerTask('run:docs', ['connect:docs']);

  grunt.registerTask('publish', ['build.plugins-combined', 's3']);
};
