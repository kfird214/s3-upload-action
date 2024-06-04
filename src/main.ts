import * as core from '@actions/core';
import { GetObjectCommand, ObjectCannedACL, S3 } from '@aws-sdk/client-s3';
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import qr from 'qrcode';

const NODE_ENV = process.env['NODE_ENV'];

// If you want to run it locally, set the environment variables like `$ export SOME_KEY=<your token>`
const AWS_ACCESS_KEY_ID = process.env['AWS_ACCESS_KEY_ID'];
const AWS_SECRET_ACCESS_KEY = process.env['AWS_SECRET_ACCESS_KEY'];
const AWS_BUCKET = process.env['AWS_BUCKET'];

interface GithubInput {
    awsAccessKeyId: string
    awsSecretAccessKey: string
    awsRegion: string
    awsBucket: string
    filePath: string
    destinationDir: string
    bucketRoot: string
    outputFileUrl: string
    contentType: string
    outputQrUrl: string
    qrWidth: string
    public: string
    expire: string
    alternativeDomainPublic: string
    alternativeDomainPrivate: string
}

let input: GithubInput;
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
    assert(AWS_ACCESS_KEY_ID, 'AWS_ACCESS_KEY_ID is required');
    assert(AWS_SECRET_ACCESS_KEY, 'AWS_SECRET_ACCESS_KEY is required');
    assert(AWS_BUCKET, 'AWS_BUCKET is required');

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

const s3 = new S3({
    region: input.awsRegion,
    credentials: {
        accessKeyId: input.awsAccessKeyId,
        secretAccessKey: input.awsSecretAccessKey,
    },
});

async function run(input: GithubInput) {

    const expire = parseInt(input.expire);
    if (isNaN(expire) || expire < 0 || 604800 < expire) {
        throw new Error('"expire" input should be a number between 0 and 604800.');
    }

    const qrWidth = parseInt(input.qrWidth);
    if (!qrWidth || qrWidth < 100 || 1000 < qrWidth) {
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

    let acl: ObjectCannedACL = input.public == 'true' ? 'public-read' : 'private';

    await s3.putObject({
        Bucket: input.awsBucket,
        Key: fileKey,
        ContentType: input.contentType,
        Body: fs.createReadStream(input.filePath),
        ACL: acl,
    });

    let fileUrl;
    if (input.outputFileUrl == 'true' || input.outputQrUrl == 'true') {
        if (input.public == 'true') {
            fileUrl = `https://${input.awsBucket}.s3.${input.awsRegion}.amazonaws.com/${fileKey}`;
            if (input.alternativeDomainPublic) {
                fileUrl = fileUrl.replace(`${input.awsBucket}.s3.${input.awsRegion}.amazonaws.com/${bucketRoot}`, `${input.alternativeDomainPublic}/`);
            }
        } else {
            const getObjectCommand = new GetObjectCommand({
                Bucket: input.awsBucket,
                Key: fileKey,
            });

            fileUrl = await getSignedUrl(s3, getObjectCommand, {
                expiresIn: 10 * 60, // 10 minutes
            });

            if (input.alternativeDomainPrivate) {
                fileUrl = fileUrl.replace(`${input.awsBucket}.s3.${input.awsRegion}.amazonaws.com/${bucketRoot}`, `${input.alternativeDomainPrivate}/`);
            }
        }
        if (input.outputFileUrl == 'true') {
            core.setOutput('file-url', fileUrl);
        }
    }

    if (input.outputQrUrl != 'true') return;

    if (fileUrl) {
        const qrKey = bucketRoot + destinationDir + 'qr.png';
        const tmpQrFile = './s3-upload-action-qr.png';

        await qr.toFile(tmpQrFile, fileUrl, { width: qrWidth })

        await s3.putObject({
            Bucket: input.awsBucket,
            Key: qrKey,
            ContentType: 'image/png', // Required to display as an image in the browser
            Body: fs.readFileSync(tmpQrFile),
            ACL: 'public-read', // always public
        });
        fs.unlinkSync(tmpQrFile);
        
        let qrUrl = `https://${input.awsBucket}.s3.${input.awsRegion}.amazonaws.com/${qrKey}`;
        if (input.alternativeDomainPublic) {
            qrUrl = qrUrl.replace(`${input.awsBucket}.s3.${input.awsRegion}.amazonaws.com/${bucketRoot}`, `${input.alternativeDomainPublic}/`);
        }
        core.setOutput('qr-url', qrUrl);
    }
}

run(input)
    .then(result => {
        core.setOutput('result', 'success');
    })
    .catch(error => {
        core.setOutput('result', 'failure');
        core.setFailed(error.message);
    });

function getRandomStr(length: number) {
    const c = 'abcdefghijklmnopqrstuvwxyzABCDEFGHJKLMNOPQRSTUVWXYZ0123456789';
    let r = '';
    for (let i = 0; i < length; i++) {
        r += c[Math.floor(Math.random() * c.length)];
    }
    return r;
}
