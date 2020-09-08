import childProcess from 'child_process';
import fs from 'fs';

import { lambdaPreludeReplacer as lambdaFixures } from './awsLambdaPrelude';

/**
 * This function create a development package.
 * @param remainingPrelude  - holds remaining prelude data
 * @param callback -return the development package code output.
 * @hidden
 */
function runLambdaFunction(remainingPrelude: any, callback: any) {
  const lambdaPrelude = lambdaFixures(remainingPrelude);

  const __packageDir: string = './test/testCase';
  const __setupJsonFile: string = './test/setup.json';
  const __buildDist: string = './dist';

  if (!fs.existsSync(__buildDist)) {
    throw Error('Build not found in specified directory.');
  }

  if (fs.existsSync(__packageDir)) {
    childProcess.execSync('cd ./test/; rm -rf testCase; cd ..; cd ..;');
  }

  fs.mkdirSync(__packageDir);

  fs.appendFileSync(`${__packageDir}/index.js`, lambdaPrelude);

  if (fs.existsSync(__setupJsonFile)) {
    const packageData = fs.readFileSync(__setupJsonFile);

    fs.appendFileSync(`${__packageDir}/package.json`, packageData);

    childProcess.execSync('cd ./test/testCase; npm install --prefix; cd ..; cd ..;');
    childProcess.execSync('cp -r build dist esm ./test/testCase/node_modules/@sentry/integrations/');

    /**
     * Check the async/sync scenario, run the development package code and return the package output.
     */
    if (remainingPrelude.scenario === 'async') {
      const event = childProcess.execSync('node ./test/testCase/index.js');

      const eventParser = event.toString('utf-8');
      const mainEvent = eventParser.split('Event:');
      callback(null, mainEvent[1]);
    } else {
      childProcess.exec('node ./test/testCase/index.js', (error, res) => {
        if (error !== null) {
          const mainEventSync = res.split('Event:');
          callback(null, JSON.parse(mainEventSync[1]));
        }
      });
    }
  }
}

/**
 * Unit test case suit
 */
describe('AWS Lambda serverless test suit ', () => {
  const timeout: number = 3000;
  /**
   * Test case for handled exception for sync and async scenario with timeout warning true.
   */
  test(
    'should be capture handled exception for async scenario timeoutWarning=true',
    done => {
      const remainingPrelude = {
        error: `
      notDefinedFunction();
       `,
        scenario: 'async',
        timeoutWarning: true,
      };
      runLambdaFunction(remainingPrelude, (err: any, _res: any) => {
        if (err) {
          throw new Error(err);
        } else {
          const res = JSON.parse(_res);
          expect(res.exception.values[0].type).toBe('ReferenceError');
          expect(res.exception.values[0].value).toBe('notDefinedFunction is not defined');
        }
      });
      done();
    },
    timeout,
  );

  test(
    'should be capture handled exception for sync scenario timeoutWarning=true',
    done => {
      const remainingPrelude = {
        error: `
      notDefinedFunction();
       `,
        scenario: '',
        timeoutWarning: true,
      };
      runLambdaFunction(remainingPrelude, (err: any, _res: any) => {
        if (err) {
          throw new Error(err);
        } else {
          expect('ReferenceError').toBe(_res.exception.values[0].type);
          expect('notDefinedFunction is not defined').toBe(_res.exception.values[0].value);
        }
      });
      done();
    },
    timeout,
  );

  /**
   * Test case for handled exception for sync and async scenario with timeout warning false.
   */
  test(
    'should be capture handled exception for async scenario timeoutWarning=false',
    done => {
      const remainingPrelude = {
        error: `
      notDefinedFunction();
       `,
        scenario: 'async',
        timeoutWarning: false,
      };
      runLambdaFunction(remainingPrelude, (err: any, _res: any) => {
        if (err) {
          throw new Error(err);
        } else {
          const res = JSON.parse(_res);
          expect(res.exception.values[0].type).toBe('ReferenceError');
          expect(res.exception.values[0].value).toBe('notDefinedFunction is not defined');
        }
      });
      done();
    },
    timeout,
  );

  test(
    'should be capture handled exception for sync scenario timeoutWarning=false',
    done => {
      const remainingPrelude = {
        error: `
      notDefinedFunction();
       `,
        scenario: '',
        timeoutWarning: false,
      };
      runLambdaFunction(remainingPrelude, (err: any, _res: any) => {
        if (err) {
          throw new Error(err);
        } else {
          expect('ReferenceError').toBe(_res.exception.values[0].type);
          expect('notDefinedFunction is not defined').toBe(_res.exception.values[0].value);
        }
      });
      done();
    },
    timeout,
  );

  /**
   * Test case for unhandled exception for sync and async scenario with timeout warning true.
   */
  test(
    'should be capture unhandled exception for async scenario timeoutWarning=true',
    done => {
      const remainingPrelude = {
        error: `
      throw new Error('Dummy error');
       `,
        scenario: 'async',
        timeoutWarning: true,
      };
      runLambdaFunction(remainingPrelude, (err: any, _res: any) => {
        if (err) {
          throw new Error(err);
        } else {
          const res = JSON.parse(_res);
          expect(res.exception.values[0].type).toBe('Error');
          expect(res.exception.values[0].value).toBe('Dummy error');
        }
      });
      done();
    },
    timeout,
  );

  test(
    'should be capture unhandled exception for sync scenario timeoutWarning=true',
    done => {
      const remainingPrelude = {
        error: `
      throw new Error('Dummy error');
       `,
        scenario: '',
        timeoutWarning: true,
      };
      runLambdaFunction(remainingPrelude, (err: any, _res: any) => {
        if (err) {
          throw new Error(err);
        } else {
          expect(_res.exception.values[0].type).toBe('Error');
          expect(_res.exception.values[0].value).toBe('Dummy error');
        }
      });
      done();
    },
    timeout,
  );

  /**
   * Test case for handled exception for sync and async scenario with timeout warning false.
   */
  test(
    'should be capture unhandled exception for async scenario timeoutWarning=false',
    done => {
      const remainingPrelude = {
        error: `
      throw new Error('Dummy error');
       `,
        scenario: 'async',
        timeoutWarning: false,
      };
      runLambdaFunction(remainingPrelude, (err: any, _res: any) => {
        if (err) {
          throw new Error(err);
        } else {
          const res = JSON.parse(_res);
          expect(res.exception.values[0].type).toBe('Error');
          expect(res.exception.values[0].value).toBe('Dummy error');
        }
      });
      done();
    },
    timeout,
  );

  test(
    'should be capture unhandled exception for sync scenario timeoutWarning=false',
    done => {
      const remainingPrelude = {
        error: `
      throw new Error('Dummy error');
       `,
        scenario: '',
        timeoutWarning: false,
      };
      runLambdaFunction(remainingPrelude, (err: any, _res: any) => {
        if (err) {
          throw new Error(err);
        } else {
          expect(_res.exception.values[0].type).toBe('Error');
          expect(_res.exception.values[0].value).toBe('Dummy error');
        }
      });
      done();
    },
    timeout,
  );

  /**
   * Test case for timeout error for sync and async scenario.
   */
  test(
    'should be timeout error for async scenario timeoutWarning=true',
    done => {
      const remainingPrelude = {
        error: `
      let data = [];
  let ip_address = "192.0.2.1"; // Dummy IP which does not exist
  let url = "http://" + ip_address + "/api/test";
  // let url = 'http://dummy.restapiexample.com/api/v1/employees';
  const response = await new Promise((resolve) => {
    // callback function for the get the data from provided URL
    const req = http.get(url, function (res) {
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        resolve({
          statusCode: 200,
          body: JSON.parse(data),
        });
      });
    });
    // error is showing in the console.
    req.on("error", (e) => {
      console.log("Error is:- " + e);
    });
  });
  return response;
       `,
        scenario: 'async',
        timeoutWarning: true,
      };
      runLambdaFunction(remainingPrelude, (err: any, _res: any) => {
        if (err) {
          throw new Error(err);
        } else {
          const event = _res.split('\nError is:- Error: connect ETIMEDOUT');

          const res = JSON.parse(event[0]);

          expect(res.exception.values[0].type).toBe('Error');
          expect(res.exception.values[0].value).toBe(
            'WARNING : Function is expected to get timed out. Configured timeout duration = 4 seconds.',
          );
        }
      });
      done();
    },
    timeout,
  );

  test(
    'should be timeout error for sync scenario timeoutWarning=true',
    done => {
      const remainingPrelude = {
        error: `
      let data = [];
      let ip_address = "192.0.2.1"; // Dummy IP which does not exist
      let url = "http://" + ip_address + "/api/test";
      http
        .get(url, (res) => {
          callback(null, res.statusCode);
        })
        .on("error", (e) => {
          callback(Error(e));
        });
       `,
        scenario: '',
        timeoutWarning: true,
      };
      runLambdaFunction(remainingPrelude, (err: any, _res: any) => {
        if (err) {
          throw new Error(err);
        } else {
          expect(_res.exception.values[0].type).toBe('Error');
          expect(_res.exception.values[0].value).toBe(
            'WARNING : Function is expected to get timed out. Configured timeout duration = 4 seconds.',
          );
        }
      });
      done();
    },
    timeout,
  );
});
