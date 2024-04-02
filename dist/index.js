require('./sourcemap-register.js');/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ 444:
/***/ ((module) => {

module.exports = eval("require")("@actions/core");


/***/ }),

/***/ 353:
/***/ ((module) => {

module.exports = eval("require")("aws-sdk");


/***/ }),

/***/ 34:
/***/ ((module) => {

module.exports = eval("require")("qrcode");


/***/ }),

/***/ 147:
/***/ ((module) => {

"use strict";
module.exports = require("fs");

/***/ }),

/***/ 17:
/***/ ((module) => {

"use strict";
module.exports = require("path");

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __nccwpck_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		var threw = true;
/******/ 		try {
/******/ 			__webpack_modules__[moduleId](module, module.exports, __nccwpck_require__);
/******/ 			threw = false;
/******/ 		} finally {
/******/ 			if(threw) delete __webpack_module_cache__[moduleId];
/******/ 		}
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/compat */
/******/ 	
/******/ 	if (typeof __nccwpck_require__ !== 'undefined') __nccwpck_require__.ab = __dirname + "/";
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// This entry need to be wrapped in an IIFE because it need to be isolated against other modules in the chunk.
(() => {
const core = __nccwpck_require__(444);
const aws = __nccwpck_require__(353);
const fs = __nccwpck_require__(147);
const path = __nccwpck_require__(17);
const qr = __nccwpck_require__(34);

const NODE_ENV = process.env['NODE_ENV'];

// If you want to run it locally, set the environment variables like `$ export SOME_KEY=<your token>`
const AWS_ACCESS_KEY_ID = process.env['AWS_ACCESS_KEY_ID'];
const AWS_SECRET_ACCESS_KEY = process.env['AWS_SECRET_ACCESS_KEY'];
const AWS_BUCKET = process.env['AWS_BUCKET'];

let input;
if (NODE_ENV != 'local') {
  input = {
    awsAccessKeyId: core.getInput('aws-access-key-id', { required: true }),
    awsSecretAccessKey: core.getInput('aws-secret-access-key', { required: true }),
    awsRegion: core.getInput('aws-region', { required: true }),
    awsBucket: core.getInput('aws-bucket', { required: true }),
    filePath: core.getInput('file-path', { required: true }),
    destinationDir: core.getInput('destination-dir'),
    bucketRoot: core.getInput('bucket-root'),
    outputFileUrl: core.getInput('output-file-url'),
    contentType: core.getInput('content-type'),
    outputQrUrl: core.getInput('output-qr-url'),
    qrWidth: core.getInput('qr-width'),
    public: core.getInput('public'),
    expire: core.getInput('expire'),
    alternativeDomainPublic: core.getInput('alternative-domain-public'),
    alternativeDomainPrivate: core.getInput('alternative-domain-private'),
  };
} else {
  input = {
    awsAccessKeyId: AWS_ACCESS_KEY_ID,
    awsSecretAccessKey: AWS_SECRET_ACCESS_KEY,
    awsRegion: 'ap-northeast-1',
    awsBucket: AWS_BUCKET,
    filePath: './README.md',
    destinationDir: '',
    bucketRoot: '',
    outputFileUrl: 'true',
    contentType: '',
    outputQrUrl: 'true',
    qrWidth: '120',
    public: 'false',
    expire: '180',
    alternativeDomainPublic: '',
    alternativeDomainPrivate: '',
  };
}

aws.config.update({
  accessKeyId: input.awsAccessKeyId,
  secretAccessKey: input.awsSecretAccessKey,
  region: input.awsRegion,
});

const s3 = new aws.S3({signatureVersion: 'v4'});

async function run(input) {

  const expire = parseInt(input.expire);
  if (isNaN(expire) | expire < 0 | 604800 < expire) {
    throw new Error('"expire" input should be a number between 0 and 604800.');
  }

  const qrWidth = parseInt(input.qrWidth);
  if (!qrWidth | qrWidth < 100 | 1000 < qrWidth) {
    throw new Error('"qr-width" input should be a number between 100 and 1000.');
  }

  let bucketRoot = input.bucketRoot;
  if (bucketRoot) {
    if (bucketRoot.startsWith('/')) {
      bucketRoot = bucketRoot.slice(1);
    }
    if (bucketRoot && !bucketRoot.endsWith('/')) {
      bucketRoot = bucketRoot + '/'
    }
  } else {
    bucketRoot = 'artifacts/'; // Do not use the default value of input to match the behavior with destinationDir
  }

  let destinationDir = input.destinationDir;
  if (destinationDir) {
    if (destinationDir.startsWith('/')) {
      destinationDir = destinationDir.slice(1);
    }
    if (destinationDir && !destinationDir.endsWith('/')) {
      destinationDir = destinationDir + '/'
    }
  } else {
    destinationDir = getRandomStr(32) + '/';
  }

  const fileKey = bucketRoot + destinationDir + path.basename(input.filePath);

  let acl;
  if (input.public == 'true') {
    acl = 'public-read';
  } else {
    acl = 'private';
  }

  let params = {
    Bucket: input.awsBucket,
    Key: fileKey,
    ContentType: input.contentType,
    Body: fs.createReadStream(input.filePath),
    ACL: acl,
  };
  await s3.putObject(params).promise();

  let fileUrl;
  if (input.outputFileUrl == 'true' || input.outputQrUrl == 'true') {
    if (input.public == 'true') {
      fileUrl = `https://${input.awsBucket}.s3.${input.awsRegion}.amazonaws.com/${fileKey}`;
      if (input.alternativeDomainPublic) {
        fileUrl = fileUrl.replace(`${input.awsBucket}.s3.${input.awsRegion}.amazonaws.com/${bucketRoot}`, `${input.alternativeDomainPublic}/`);
      }
    } else {
      params = {
        Bucket: input.awsBucket,
        Key: fileKey,
        Expires: expire,
      };
      fileUrl = await s3.getSignedUrlPromise('getObject', params);
      if (input.alternativeDomainPrivate) {
        fileUrl = fileUrl.replace(`${input.awsBucket}.s3.${input.awsRegion}.amazonaws.com/${bucketRoot}`, `${input.alternativeDomainPrivate}/`);
      }
    }
    if (input.outputFileUrl == 'true') {
      core.setOutput('file-url', fileUrl);
    }
  }

  if (input.outputQrUrl != 'true') return;

  const qrKey = bucketRoot + destinationDir + 'qr.png';
  const tmpQrFile = './s3-upload-action-qr.png';

  await qr.toFile(tmpQrFile, fileUrl, { width: qrWidth })

  params = {
    Bucket: input.awsBucket,
    Key: qrKey,
    ContentType: 'image/png', // Required to display as an image in the browser
    Body: fs.readFileSync(tmpQrFile),
    ACL: 'public-read', // always public
  };
  await s3.putObject(params).promise();
  fs.unlinkSync(tmpQrFile);

  let qrUrl = `https://${input.awsBucket}.s3.${input.awsRegion}.amazonaws.com/${qrKey}`;
  if (input.alternativeDomainPublic) {
    qrUrl = qrUrl.replace(`${input.awsBucket}.s3.${input.awsRegion}.amazonaws.com/${bucketRoot}`, `${input.alternativeDomainPublic}/`);
  }
  core.setOutput('qr-url', qrUrl);
}

run(input)
  .then(result => {
    core.setOutput('result', 'success');
  })
  .catch(error => {
    core.setOutput('result', 'failure');
    core.setFailed(error.message);
  });

function getRandomStr(length) {
  const c = 'abcdefghijklmnopqrstuvwxyzABCDEFGHJKLMNOPQRSTUVWXYZ0123456789';
  let r = '';
  for(let i = 0; i < length; i++) {
    r += c[Math.floor(Math.random() * c.length)];
  }
  return r;
}

})();

module.exports = __webpack_exports__;
/******/ })()
;
//# sourceMappingURL=index.js.map