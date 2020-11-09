const path = require('path');
const process = require('process');

const fs = require('fs-extra');
const Lambda = require('aws-sdk/clients/lambda');
const readPkg = require('read-pkg');

// This scripts publishes current lambda layer zip bundle to AWS and sets layer permission to public.
// To run you'll probably need to set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables.
//
// The file dist-awslambda-layer/sentry-node-serverless-X.YY.zip MUST exist before publishing.
// You could get it using `node scripts/build-awslambda-layer.js` or just `yarn build`.

const allRegions = [
  'us-east-1',
  'us-east-2',
  'us-west-1',
  'us-west-2',
  'ap-south-1',
  'ap-southeast-1',
  'ap-southeast-2',
  'ap-northeast-1',
  'ap-northeast-2',
  'ca-central-1',
  'eu-central-1',
  'eu-west-1',
  'eu-west-2',
  'eu-west-3',
  'sa-east-1',
];

const layerName = 'SentryNodeServerlessSDK';

async function main() {
  const workDir = path.resolve(__dirname, '..');
  const packageJson = await readPkg({ cwd: workDir });
  const fileContents = await fs.readFile(
    path.resolve(workDir, 'dist-awslambda-layer', `sentry-node-serverless-${packageJson.version}.zip`),
  );
  const regions = allRegions;

  for (let i = 0; i < regions.length; i++) {
    const region = regions[i];
    const lambda = new Lambda({ region: region });

    const result = await lambda
      .publishLayerVersion({
        Content: {
          ZipFile: fileContents,
        },
        LayerName: layerName,
        CompatibleRuntimes: ['nodejs10.x', 'nodejs12.x'],
        LicenseInfo: 'BSD-3-Clause',
      })
      .promise();

    await lambda
      .addLayerVersionPermission({
        LayerName: layerName,
        VersionNumber: result.Version,
        StatementId: 'public',
        Action: 'lambda:GetLayerVersion',
        Principal: '*',
      })
      .promise();

    console.log(result.LayerVersionArn); // eslint-disable-line no-console
  }
}

main().then(
  () => {
    process.exit(0);
  },
  err => {
    console.error(err); // eslint-disable-line no-console
    process.exit(-1);
  },
);
