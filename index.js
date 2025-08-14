// @ts-check

const fs = require("fs-extra");
const yaml = require("js-yaml");
const { S3Client } = require("@aws-sdk/client-s3");
const { ElasticBeanstalkClient } = require("@aws-sdk/client-elastic-beanstalk");
const libUpload = require("./libs/upload");
const libConfig = require("./libs/config");
const libDeploy = require("./libs/deploy");

/**
 * Get the local config.
 * @param {string} [aws_eb_local_config_path]
 */
function getLocalConfig(aws_eb_local_config_path) {
  const local_eb_config = yaml.load(fs.readFileSync(aws_eb_local_config_path ?? "./.elasticbeanstalk/config.yml", "utf8"));

  /** @type {string} */
  const application_name = local_eb_config.global.application_name;

  /** @type {string} */
  const environemnt_name = local_eb_config["branch-defaults"].main.environment;

  return {
    application_name,
    environemnt_name,
  };
}

/**
 * @param {object} param
 * @param {S3Client} param.s3client
 * @param {ElasticBeanstalkClient} param.ebclient
 * @param {string} param.application_name
 * @param {string} param.application_version_label
 * @param {string} param.filepath
 * @param {string} [param.aws_s3_bucket]
 * @param {Record<string, string>} [param.tags]
 */
async function uploadApplicationIfNotExist({ s3client, ebclient, application_name, application_version_label, filepath, aws_s3_bucket, tags }) {
  const s3Bucket = aws_s3_bucket ?? await libUpload.obtainS3BucketFromExistingApplicationVersion(ebclient, application_name);
  if (!s3Bucket) {
    throw new Error(`Missing "aws_s3_bucket" environment variable.`);
  }

  const result = await libUpload.uploadApplicationZipFileIfNotExist({
    filepath,
    s3Bucket,
    s3client,
  }, {
    application_name,
    application_version_label,
    ebclient,
  }, tags);

  return result;
}

/**
 * Clone a existing saved configuration which also allow to override the platform Arn.
 *
 * Note the tagging saved configuration is currently not supported.
 *
 * @param {object} param
 * @param {ElasticBeanstalkClient} param.ebclient
 * @param {string} param.application_name
 * @param {string} param.from
 * @param {string} param.save_as
 * @param {string} [param.platform]
 * @param {string} [param.platformArn]
 * @param {Record<string, string>} [param.tags]
 */
async function cloneSavedConfiguration({ ebclient, application_name, from, save_as, platform, platformArn, tags })  {
  if (tags) {
    console.log("Tagging saved configuration is currently not supported.");
  }

  const _platformArn = platformArn ??
    platform
     ? await libConfig.selectPlatformArn(ebclient, platform)
     : undefined
     ;

  const properties = _platformArn
    ? { platformArn: _platformArn }
    : undefined
    ;

  const cloned = await libConfig.cloneSavedConfiguration(ebclient, {
    application_name,
    from,
    save_as,
  }, properties);

  return cloned;
}

/**
 * @param {object} param
 * @param {ElasticBeanstalkClient} param.ebclient
 * @param {string} param.application_name
 * @param {string} param.application_version_label
 * @param {string} param.from
 * @param {string} param.save_as
 * @param {string} param.env_name
 * @param {string} [param.platform]
 * @param {string} [param.platformArn]
 * @param {Record<string, string>} [param.tags]
 */
async function cloneEnvironment(param) {
  await cloneSavedConfiguration({
    application_name: param.application_name,
    ebclient: param.ebclient,
    from: param.from,
    save_as: param.save_as,
    platform: param.platform,
    platformArn: param.platform
  });

  const env_param = {
    ApplicationName: param.application_name,
    EnvironmentName: param.env_name,
    // The Elastic Beanstalk domain. A random domain will be assigned if omitted.
    // CNAMEPrefix: `${platform-name-and-version}-${application-name}-temp`,
    TemplateName: param.save_as,
    VersionLabel: param.application_version_label,
  }

  const state = await libDeploy.deployNewEnvironment(
    param.ebclient,
    env_param,
    param.tags
  );
  return state;
}

/**
 * Deploy the specific application version to current environment.
 *
 * @param {ElasticBeanstalkClient} eb
 * @param {string} envName
 * @param {string} versionLabel
 */
async function deployApplication(eb, envName, versionLabel) {
  return libDeploy.deployNewApplicationVersion(eb, envName, versionLabel);
}

module.exports = {
  cloneEnvironment,
  cloneSavedConfiguration,
  deployApplication,
  getLocalConfig,
  uploadApplicationIfNotExist,
};
