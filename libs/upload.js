// @ts-check

const fs = require("fs-extra");
const path = require("path");
const {
  ElasticBeanstalkClient,
  DescribeApplicationsCommand,
  DescribeApplicationVersionsCommand,
  CreateApplicationVersionCommand,
} = require("@aws-sdk/client-elastic-beanstalk");
const {
  S3Client,
  PutObjectCommand,
} = require("@aws-sdk/client-s3");
const { objectToTagging, objectToTags } = require("./tag");

/**
 * @param {ElasticBeanstalkClient} eb
 * @param {string} application_name
 * @returns {Promise<string | undefined>}
 */
async function obtainS3BucketFromExistingApplicationVersion(eb, application_name) {
  const result = await eb.send(new DescribeApplicationVersionsCommand({
    ApplicationName: application_name,
  }));
  return result?.ApplicationVersions?.at(0)?.SourceBundle?.S3Bucket;
}

/**
 * @param {ElasticBeanstalkClient} eb
 * @param {string} application_name
 * @returns {Promise<import("@aws-sdk/client-elastic-beanstalk").ApplicationDescription | undefined>}
 */
async function obtainApplication(eb, application_name) {
  const result = await eb.send(new DescribeApplicationsCommand({
    ApplicationNames: [ application_name ],
  }));

  return result?.Applications?.at(0);
}

/**
 * @param {ElasticBeanstalkClient} eb
 * @param {string} application_name
 * @param {string} application_version_label
 * @returns {Promise<boolean>}
 */
async function isApplicationVersionExist(eb, application_name, application_version_label) {
  const application = await obtainApplication(eb, application_name);
  if (!application || !application.Versions) {
    return false;
  }

  const found = application.Versions.find((v) => {
    return v === application_version_label;
  });

  return !!found;
}

/**
 * @param {ElasticBeanstalkClient} eb
 * @param {object} param
 * @param {string} param.s3Bucket
 * @param {string} param.s3Key
 * @param {string} param.application_name
 * @param {string} param.application_version_label
 * @param {Record<string, string>} [tags]
 */
async function createAppVersion(eb, param, tags) {
  const result = await eb.send(new CreateApplicationVersionCommand({
    ApplicationName: param.application_name,
    VersionLabel: param.application_version_label,
    SourceBundle: {
      S3Bucket: param.s3Bucket,
      S3Key: param.s3Key,
    },
    Tags: tags
      ? objectToTags(tags)
      : undefined
      ,
  }));

  return result.ApplicationVersion;
}

/**
 * @param {S3Client} s3
 * @param {string} local The local file path
 * @param {object} remote s3 configuration
 * @param {string} remote.s3Bucket s3 bucket
 * @param {string} [remote.s3Key] s3 key
 * @param {Record<string, string>} [tags]
 * @returns
 */
async function uploadToS3(s3, local, remote, tags) {
  if (!fs.existsSync(local)) {
    throw new Error(`File not found: ${local}`);
  }

  const key = remote.s3Key ?? `${Date.now()}-${path.basename(local)}`;
  const file = await fs.readFile(local);

  const tagging = tags
    ? objectToTagging(tags)
    : undefined
    ;

  const result = await s3.send(new PutObjectCommand({
    Bucket: remote.s3Bucket,
    Key: key,
    Body: file,
    Tagging: tagging
  }));

  return {
    result,
    s3Key: key,
  };
}

/**
 * @param {object} upload
 * @param {S3Client} upload.s3client
 * @param {string} upload.filepath
 * @param {string} upload.s3Bucket
 * @param {string} [upload.s3Key]
 * @param {object} create
 * @param {ElasticBeanstalkClient} create.ebclient
 * @param {string} create.application_name
 * @param {string} create.application_version_label
 * @param {Record<string, string>} [tags]
 */
async function uploadApplicationZipFile(upload, create, tags) {
  // upload application file to s3
  const { s3Key } = await uploadToS3(
    upload.s3client,
    upload.filepath,
    { s3Bucket: upload.s3Bucket, s3Key: upload.s3Key },
    tags
  );
  // create application version
  const result = await createAppVersion(create.ebclient, {
    application_name: create.application_name,
    application_version_label: create.application_version_label,
    s3Bucket: upload.s3Bucket,
    s3Key,
  }, tags);

  if (!result) {
    throw new Error(`Failed to create new Application Version: ${create.application_version_label}. If necessary, you must manually delete the application file from the S3 bucket using the returned s3Key.`);
  }

  return {
    s3Key,
    version: result,
  };
}

/**
 * @param {object} upload
 * @param {S3Client} upload.s3client
 * @param {string} upload.filepath
 * @param {string} upload.s3Bucket
 * @param {string} [upload.s3Key]
 * @param {object} create
 * @param {ElasticBeanstalkClient} create.ebclient
 * @param {string} create.application_name
 * @param {string} create.application_version_label
 * @param {Record<string, string>} [tags]
 */
async function uploadApplicationZipFileIfNotExist(upload, create, tags) {
  if (await isApplicationVersionExist(create.ebclient, create.application_name, create.application_version_label)) {
    return;
  }

  const result = await uploadApplicationZipFile({
    s3client: upload.s3client,
    s3Bucket: upload.s3Bucket,
    filepath: upload.filepath,
  }, {
    ebclient: create.ebclient,
    application_name: create.application_name,
    application_version_label: create.application_version_label,
  }, tags);

  return result;
}

module.exports = {
  createAppVersion,
  isApplicationVersionExist,
  obtainApplication,
  obtainS3BucketFromExistingApplicationVersion,
  uploadApplicationZipFile,
  uploadApplicationZipFileIfNotExist,
  uploadToS3,
};
