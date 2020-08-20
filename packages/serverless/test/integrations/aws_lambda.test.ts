const AWS = require('aws-sdk');
const fs = require('fs');
const childProcess = require('child_process');
const uuid = require('uuid');
const lambda = new AWS.Lambda({ apiVersion: '2015-03-31', region: 'us-east-2' });

function runLambdaFunction(additionalLambdaPrelude: any, callback: any) {
  if (
    process.env.AWS_ACCESS_KEY_ID == undefined &&
    process.env.AWS_SECRET_ACCESS_KEY == undefined &&
    process.env.AWS_LAMBDA_ROLE == undefined
  ) {
    throw new Error('AWS credentials or roles are not set correctly');
  }

  const lambdaPrelude = `
const Sentry = require("@sentry/serverless");
const http = require("http");
const AwsLambda = Sentry.Integrations.AWSLambda;
const { HTTPSTransport } = require("@sentry/node/dist/transports");

class testTransport extends HTTPSTransport {
  constructor() {
    super(...arguments);
  }
  async sendEvent(event) {
    console.log("Event:", JSON.stringify(event));
  }
}
exports.handler = ${additionalLambdaPrelude.scenario} (event, context) => {
  // Configure the Sentry SDK.
  Sentry.init({
    dsn:
      "https://e16b3f19d01b4989b118f20dbcc11f87@o388065.ingest.sentry.io/5224330",
    transport: testTransport,
    integrations: [new AwsLambda({ context, timeoutWarning: true})],
  });

  ${additionalLambdaPrelude.error}

}; `;

  const packageDir: string = './test/testCase';
  const setupJsonFile: string = './test/setup.json';
  const buildDist: string = './dist';

  if (!fs.existsSync(buildDist)) {
    throw Error('Build not found in specified directory.');
  } else {
    childProcess.execSync('cp -r dist esm ./test/serverless/');
  }

  if (fs.existsSync(packageDir)) {
    childProcess.execSync('cd ./test/; rm -rf testCase; cd ..; cd ..;');
  }

  fs.mkdirSync(packageDir);
  fs.appendFile(packageDir + '/index.js', lambdaPrelude, function (err: any) {
    if (err) {
      callback(err);
    } else if (fs.existsSync(setupJsonFile)) {
      fs.readFile(setupJsonFile, function (err: any, packageData: any) {
        if (err) {
          callback(err);
        } else {
          fs.appendFile(packageDir + '/package.json', packageData, function (err: any) {
            if (err) {
              callback(err);
            } else {
              childProcess.execSync('cd ./test/testCase; npm install --prefix; cd ..; cd ..;');
              childProcess.execSync('cp -r ./test/serverless ./test/testCase/node_modules/@sentry/');
              childProcess.execSync('cp -r ../node/dist esm ./test/testCase/node_modules/@sentry/node/');
              childProcess.execSync('cd ./test/testCase; zip -r ../testCase.zip . *; cd ..; cd ..;');

              callback(null, true);
            }
          });
        }
      });
    } else {
      callback('setup.json does not exist.');
    }
  });
}

function awsSdkFunctions(runtime: string, callback: any): void {
  const zipContents = fs.readFileSync('./test/testCase.zip');

  const createFunctionParams = {
    Code: {
      ZipFile: Buffer.from(zipContents),
    },
    Description: 'lambda function for testing',
    FunctionName: 'test-lambda-' + uuid.v4(),
    Handler: 'index.handler',
    KMSKeyArn: null,
    MemorySize: 128,
    Publish: true,
    Role: process.env.AWS_LAMBDA_ROLE,
    Runtime: runtime,
    Tags: {
      DEPARTMENT: 'Assets',
    },
    Timeout: 3,
    TracingConfig: {
      Mode: 'Active',
    },
  };

  lambda.createFunction(createFunctionParams, (err: any, res: any) => {
    if (err) {
      callback(err);
    } else {
      const invokeFunctionParams = {
        FunctionName: createFunctionParams.FunctionName,
        Payload: 'true',
        LogType: 'Tail',
      };
      if (res) {
        lambda.invoke(invokeFunctionParams, (err: { stack: any }, functionInvokeData: any) => {
          if (err) {
            callback(err);
          } else {
            if (functionInvokeData) {
              const deleteFunctionParams = {
                FunctionName: invokeFunctionParams.FunctionName,
              };

              lambda.deleteFunction(deleteFunctionParams, (err: any) => {
                if (err) {
                  callback(err);
                } else {
                  callback(null, functionInvokeData);
                }
              });
            }
          }
        });
      }
    }
  });
}

function awsEventParser(data: any) {
  let eventData = Buffer.from(data.LogResult, 'base64').toString('ascii').split('\n');
  let value = eventData[2].split('Event:');
  let event = JSON.parse(value[1]);
  return event;
}

function awsEventParserForTimeout(data: any) {
  let eventData = Buffer.from(data.LogResult, 'base64').toString('ascii').split('\n');
  let eventLog = eventData[1].split('Event:');
  return JSON.parse(eventLog[1]);
}

describe('AWS Lambda serverless test suit ', () => {
  // Handled exception for with Async and Sync scenario for NodeJS10.x and NodeJS12.x
  test('should be capture handled exception for nodejs10.x version async scenario', (done) => {
    const additionalLambdaPrelude: object = {
      error: `
    //throws a dummy error
     throw new Error("Dummy Error.");
    `,
      scenario: 'async',
    };
    runLambdaFunction(additionalLambdaPrelude, (err: any) => {
      if (err) {
        throw new Error(err);
      } else {
        let runtime: string = 'nodejs10.x';

        awsSdkFunctions(runtime, (err: any, res: any) => {
          if (err) {
            throw new Error(err);
          } else {
            let event = awsEventParser(res);
            let resPayload = JSON.parse(res.Payload);
            expect(res.FunctionError).toBe('Unhandled');
            expect(res.Payload).toBe(
              '{"errorType":"Error","errorMessage":"Dummy Error.","trace":["Error: Dummy Error.","    at Runtime.exports.handler (/var/task/index.js:26:12)","    at Runtime.handleOnce (/var/runtime/Runtime.js:66:25)"]}',
            );
            expect(resPayload.errorType).toBe('Error');
            expect(resPayload.errorMessage).toBe('Dummy Error.');
            expect(event.extra['sys.argv'][1]).toBe('/var/runtime/index.js');
            done();
          }
        });
      }
    });
  }, 60000);

  test('should be capture handled exception for nodejs10.x version sync scenario', (done) => {
    const additionalLambdaPrelude: object = {
      error: `
    //throws a dummy error
     throw new Error("Dummy Error.");
    `,
      scenario: '',
    };
    runLambdaFunction(additionalLambdaPrelude, (err: any) => {
      if (err) {
        throw new Error(err);
      } else {
        let runtime: string = 'nodejs10.x';

        awsSdkFunctions(runtime, (err: any, res: any) => {
          if (err) {
            throw new Error(err);
          } else {
            let event = awsEventParser(res);
            let resPayload = JSON.parse(res.Payload);
            expect(res.FunctionError).toBe('Unhandled');
            expect(res.Payload).toBe(
              '{"errorType":"Error","errorMessage":"Dummy Error.","trace":["Error: Dummy Error.","    at Runtime.exports.handler (/var/task/index.js:26:12)","    at Runtime.handleOnce (/var/runtime/Runtime.js:66:25)"]}',
            );
            expect(resPayload.errorType).toBe('Error');
            expect(resPayload.errorMessage).toBe('Dummy Error.');
            expect(event.extra['sys.argv'][1]).toBe('/var/runtime/index.js');
            done();
          }
        });
      }
    });
  }, 60000);

  test('should be capture handled exception for nodejs12.x version async scenario', (done) => {
    const additionalLambdaPrelude: object = {
      error: `
    //throws a dummy error
     throw new Error("Dummy Error.");
    `,
      scenario: 'async',
    };
    runLambdaFunction(additionalLambdaPrelude, (err: any) => {
      if (err) {
        throw new Error(err);
      } else {
        let runtime = 'nodejs12.x';
        awsSdkFunctions(runtime, (err: any, res: any) => {
          if (err) {
            throw new Error(err);
          } else {
            let event = awsEventParser(res);
            let resPayload = JSON.parse(res.Payload);
            expect(res.FunctionError).toBe('Unhandled');
            expect(res.Payload).toBe(
              '{"errorType":"Error","errorMessage":"Dummy Error.","trace":["Error: Dummy Error.","    at Runtime.exports.handler (/var/task/index.js:26:12)","    at Runtime.handleOnce (/var/runtime/Runtime.js:66:25)"]}',
            );
            expect(resPayload.errorType).toBe('Error');
            expect(resPayload.errorMessage).toBe('Dummy Error.');
            expect(event.extra['sys.argv'][1]).toBe('/var/runtime/index.js');
            done();
          }
        });
      }
    });
  }, 60000);

  test('should be capture handled exception for nodejs12.x version sync scenario', (done) => {
    const additionalLambdaPrelude: object = {
      error: `
    //throws a dummy error
     throw new Error("Dummy Error.");
    `,
      scenario: '',
    };
    runLambdaFunction(additionalLambdaPrelude, (err: any) => {
      if (err) {
        throw new Error(err);
      } else {
        let runtime = 'nodejs12.x';
        awsSdkFunctions(runtime, (err: any, res: any) => {
          if (err) {
            throw new Error(err);
          } else {
            let event = awsEventParser(res);
            let resPayload = JSON.parse(res.Payload);
            expect(res.FunctionError).toBe('Unhandled');
            expect(res.Payload).toBe(
              '{"errorType":"Error","errorMessage":"Dummy Error.","trace":["Error: Dummy Error.","    at Runtime.exports.handler (/var/task/index.js:26:12)","    at Runtime.handleOnce (/var/runtime/Runtime.js:66:25)"]}',
            );
            expect(resPayload.errorType).toBe('Error');
            expect(resPayload.errorMessage).toBe('Dummy Error.');
            expect(event.extra['sys.argv'][1]).toBe('/var/runtime/index.js');
            done();
          }
        });
      }
    });
  }, 60000);

  // Unhandled exception for with Async and Sync scenario for NodeJS10.x and NodeJS12.x
  test('should be capture unhandled exception for nodejs10.x version async scenario', (done) => {
    const additionalLambdaPrelude: object = {
      error: `
      //call undefined function.
      notDefinedFunction();
    `,
      scenario: 'async',
    };
    runLambdaFunction(additionalLambdaPrelude, (err: any) => {
      if (err) {
        throw new Error(err);
      } else {
        let runtime = 'nodejs10.x';
        awsSdkFunctions(runtime, (err: any, res: any) => {
          if (err) {
            throw new Error(err);
          } else {
            let event = awsEventParser(res);
            let resPayload = JSON.parse(res.Payload);
            expect(res.FunctionError).toBe('Unhandled');
            expect(res.Payload).toBe(
              '{"errorType":"ReferenceError","errorMessage":"notDefinedFunction is not defined","trace":["ReferenceError: notDefinedFunction is not defined","    at Runtime.exports.handler (/var/task/index.js:26:7)","    at Runtime.handleOnce (/var/runtime/Runtime.js:66:25)"]}',
            );
            expect(resPayload.errorType).toBe('ReferenceError');
            expect(resPayload.errorMessage).toBe('notDefinedFunction is not defined');
            expect(event.extra['sys.argv'][1]).toBe('/var/runtime/index.js');
            done();
          }
        });
      }
    });
  }, 60000);

  test('should be capture unhandled exception for nodejs10.x version sync scenario', (done) => {
    const additionalLambdaPrelude: object = {
      error: `
      //call undefined function.
      notDefinedFunction();
    `,
      scenario: '',
    };
    runLambdaFunction(additionalLambdaPrelude, (err: any) => {
      if (err) {
        throw new Error(err);
      } else {
        let runtime = 'nodejs10.x';
        awsSdkFunctions(runtime, (err: any, res: any) => {
          if (err) {
            throw new Error(err);
          } else {
            let event = awsEventParser(res);
            let resPayload = JSON.parse(res.Payload);
            expect(res.FunctionError).toBe('Unhandled');
            expect(res.Payload).toBe(
              '{"errorType":"ReferenceError","errorMessage":"notDefinedFunction is not defined","trace":["ReferenceError: notDefinedFunction is not defined","    at Runtime.exports.handler (/var/task/index.js:26:7)","    at Runtime.handleOnce (/var/runtime/Runtime.js:66:25)"]}',
            );
            expect(resPayload.errorType).toBe('ReferenceError');
            expect(resPayload.errorMessage).toBe('notDefinedFunction is not defined');
            expect(event.extra['sys.argv'][1]).toBe('/var/runtime/index.js');
            done();
          }
        });
      }
    });
  }, 60000);

  test('should be capture unhandled exception for nodejs12.x version async scenario', (done) => {
    const additionalLambdaPrelude: object = {
      error: `
      //call undefined function.
      notDefinedFunction();
    `,
      scenario: 'async',
    };
    runLambdaFunction(additionalLambdaPrelude, (err: any) => {
      if (err) {
        throw new Error(err);
      } else {
        let runtime = 'nodejs12.x';
        awsSdkFunctions(runtime, (err: any, res: any) => {
          if (err) {
            throw new Error(err);
          } else {
            let event = awsEventParser(res);
            let resPayload = JSON.parse(res.Payload);
            expect(res.FunctionError).toBe('Unhandled');
            expect(res.Payload).toBe(
              '{"errorType":"ReferenceError","errorMessage":"notDefinedFunction is not defined","trace":["ReferenceError: notDefinedFunction is not defined","    at Runtime.exports.handler (/var/task/index.js:26:7)","    at Runtime.handleOnce (/var/runtime/Runtime.js:66:25)"]}',
            );
            expect(resPayload.errorType).toBe('ReferenceError');
            expect(resPayload.errorMessage).toBe('notDefinedFunction is not defined');
            expect(event.extra['sys.argv'][1]).toBe('/var/runtime/index.js');
            done();
          }
        });
      }
    });
  }, 60000);

  test('should be capture unhandled exception for nodejs12.x version sync scenario', (done) => {
    const additionalLambdaPrelude: object = {
      error: `
      //call undefined function.
      notDefinedFunction();
    `,
      scenario: '',
    };
    runLambdaFunction(additionalLambdaPrelude, (err: any) => {
      if (err) {
        throw new Error(err);
      } else {
        let runtime = 'nodejs12.x';
        awsSdkFunctions(runtime, (err: any, res: any) => {
          if (err) {
            throw new Error(err);
          } else {
            let event = awsEventParser(res);
            let resPayload = JSON.parse(res.Payload);
            expect(res.FunctionError).toBe('Unhandled');
            expect(res.Payload).toBe(
              '{"errorType":"ReferenceError","errorMessage":"notDefinedFunction is not defined","trace":["ReferenceError: notDefinedFunction is not defined","    at Runtime.exports.handler (/var/task/index.js:26:7)","    at Runtime.handleOnce (/var/runtime/Runtime.js:66:25)"]}',
            );
            expect(resPayload.errorType).toBe('ReferenceError');
            expect(resPayload.errorMessage).toBe('notDefinedFunction is not defined');
            expect(event.extra['sys.argv'][1]).toBe('/var/runtime/index.js');
            done();
          }
        });
      }
    });
  }, 60000);

  // Timeout error for with Async and Sync scenario for NodeJS10.x and NodeJS12.x
  test('should be capture timeout error for nodejs10.x version async scenario', (done) => {
    const additionalLambdaPrelude: object = {
      error: `
  let data = [];
  let ip_address = '192.0.2.1'; // Dummy IP which does not exist
  let url = 'http://' + ip_address + '/api/test';
  const response = await new Promise(resolve => {
    const req = http.get(url, function(res) {
      res.on('data', chunk => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({
          statusCode: 200,
          body: JSON.parse(data),
        });
      });
    });
    req.on('error', e => {
      console.log('Error is:- ' + e);
    });
  });
  return response;
    `,
      scenario: 'async',
    };

    runLambdaFunction(additionalLambdaPrelude, (err: any) => {
      if (err) {
        throw new Error(err);
      } else {
        let runtime = 'nodejs10.x';
        awsSdkFunctions(runtime, (err: any, res: any) => {
          if (err) {
            throw new Error(err);
          } else {
            let event = awsEventParserForTimeout(res);
            expect(event.exception.values[0].type).toBe('Error');
            expect(event.exception.values[0].value).toBe(
              'WARNING : Function is expected to get timed out. Configured timeout duration = 3 seconds.',
            );
            expect(event.extra['sys.argv'][1]).toBe('/var/runtime/index.js');
            expect(res.FunctionError).toBe('Unhandled');

            done();
          }
        });
      }
    });
  }, 60000);

  test('should be capture timeout error for nodejs12.x version async scenario', (done) => {
    const additionalLambdaPrelude: object = {
      error: `
  let data = [];
  let ip_address = '192.0.2.1'; // Dummy IP which does not exist
  let url = 'http://' + ip_address + '/api/test';
  const response = await new Promise(resolve => {
    const req = http.get(url, function(res) {
      res.on('data', chunk => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({
          statusCode: 200,
          body: JSON.parse(data),
        });
      });
    });
    req.on('error', e => {
      console.log('Error is:- ' + e);
    });
  });
  return response;
    `,
      scenario: 'async',
    };

    runLambdaFunction(additionalLambdaPrelude, (err: any) => {
      if (err) {
        throw new Error(err);
      } else {
        let runtime = 'nodejs12.x';
        awsSdkFunctions(runtime, (err: any, res: any) => {
          if (err) {
            throw new Error(err);
          } else {
            let event = awsEventParserForTimeout(res);
            expect(event.exception.values[0].type).toBe('Error');
            expect(event.exception.values[0].value).toBe(
              'WARNING : Function is expected to get timed out. Configured timeout duration = 3 seconds.',
            );
            expect(event.extra['sys.argv'][1]).toBe('/var/runtime/index.js');
            expect(res.FunctionError).toBe('Unhandled');

            done();
          }
        });
      }
    });
  }, 60000);

  test('should be capture timeout error for nodejs10.x version sync scenario', (done) => {
    const additionalLambdaPrelude: object = {
      error: `
  let data = [];
  let ip_address = '192.0.2.1'; // Dummy IP which does not exist
  let url = 'http://' + ip_address + '/api/test';
  http
    .get(url, (res) => {
      callback(null, res.statusCode);
    })
    .on("error", (e) => {
      callback(Error(e));
    });
    `,
      scenario: '',
    };

    runLambdaFunction(additionalLambdaPrelude, (err: any) => {
      if (err) {
        throw new Error(err);
      } else {
        let runtime = 'nodejs10.x';
        awsSdkFunctions(runtime, (err: any, res: any) => {
          if (err) {
            throw new Error(err);
          } else {
            let event = awsEventParserForTimeout(res);
            expect(event.exception.values[0].type).toBe('Error');
            expect(event.exception.values[0].value).toBe(
              'WARNING : Function is expected to get timed out. Configured timeout duration = 3 seconds.',
            );
            expect(event.extra['sys.argv'][1]).toBe('/var/runtime/index.js');
            expect(res.FunctionError).toBe('Unhandled');

            done();
          }
        });
      }
    });
  }, 60000);

  test('should be capture timeout error for nodejs12.x version sync scenario', (done) => {
    const additionalLambdaPrelude: object = {
      error: `
  let data = [];
  let ip_address = '192.0.2.1'; // Dummy IP which does not exist
  let url = 'http://' + ip_address + '/api/test';
  http
    .get(url, (res) => {
      callback(null, res.statusCode);
    })
    .on("error", (e) => {
      callback(Error(e));
    });
    `,
      scenario: '',
    };

    runLambdaFunction(additionalLambdaPrelude, (err: any) => {
      if (err) {
        throw new Error(err);
      } else {
        let runtime = 'nodejs12.x';
        awsSdkFunctions(runtime, (err: any, res: any) => {
          if (err) {
            throw new Error(err);
          } else {
            let event = awsEventParserForTimeout(res);
            expect(event.exception.values[0].type).toBe('Error');
            expect(event.exception.values[0].value).toBe(
              'WARNING : Function is expected to get timed out. Configured timeout duration = 3 seconds.',
            );
            expect(event.extra['sys.argv'][1]).toBe('/var/runtime/index.js');
            expect(res.FunctionError).toBe('Unhandled');

            done();
          }
        });
      }
    });
  }, 60000);
});
