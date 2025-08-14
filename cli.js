#!/usr/bin/env node

// @ts-check

const { Command } = require("commander");
const { S3Client } = require("@aws-sdk/client-s3");
const { ElasticBeanstalkClient } = require("@aws-sdk/client-elastic-beanstalk");
// const path = require('path');
const {
  cloneEnvironment,
  cloneSavedConfiguration,
  deployApplication,
  getLocalConfig,
  uploadApplicationIfNotExist,
} = require("./index");

// const script_name = path.basename(__filename);

const {
  // npm_config_local_prefix, // the full path of the root of this project
  // npm_package_json, // the full path of the package.json of this project
  // npm_package_name, // same as package.json.name
  // npm_package_version, // same as package.json.version

  // Optional
  // Path to the local Elastic Beanstalk config file.
  // Defaults to ".elasticbeanstalk/config.yml"
  aws_eb_local_config_path,

  // Optional
  // The S3 bucket used to store Elastic Beanstalk application source bundles.
  // You can obtain it from an existing application version using:
  // `aws elasticbeanstalk describe-application-versions --application-name <name>`
  // Defaults to the bucket currently associated with the application.
  aws_s3_bucket,
} = process.env;

const NAME = "cebenv";

/**
 * [Multi-word options such as "--template-engine" are camel-cased, becoming program.opts().templateEngine etc.](https://github.com/tj/commander.js?tab=readme-ov-file#options)
 */
const program = new Command(NAME);

const optionDescs = /** @type {const} */ ({
  version: "Application Version Label (e.g. v1.2.3)",
  filepath: "Path to the application ZIP file (e.g. ./build/v1.2.3.zip)",
  envProduct: "Adds a tag named 'Product' with the given value tag for environment. Defaults to the --product.",
  skipIfExist: "Skip the upload if the application version already exists.",
  platformArn: "Explicit platform ARN to use. See also --platform.",
  platform: "Platform name to select an ARN (e.g., Node.js, Node.js 20).",
  from: "Saved configuration name to clone (from 'eb config list').",
  saveAs: "Name for the new configuration.",
});

program.command("clone")
  .description("Clone a saved configuration that allows you to change the platformArn and use it to launch a new environment.")
  .requiredOption("--version <version>", optionDescs.version)
  .option("--platformArn [arn]", optionDescs.platformArn)
  .option("--platform [platform]", optionDescs.platform)
  .requiredOption("--from <saved-configuration-name>", optionDescs.from)
  .requiredOption("--save-as <template-name>", optionDescs.saveAs)
  .requiredOption("--env-name <environment-name>", "Name of the environment to launch with the new configuration.")
  .requiredOption("--product <tag>", "Adds a tag named 'Product' with the given value for configuration and environment.")
  .addHelpText("after",
    `\nExamples:
    $ ${NAME} clone \\
    --version v1.2.3 \\
    --platform 'Node.js 20' \\
    --from base-config \\
    --save-as new-config \\
    --env-name node-XYZ-test \\
    --product 'XYZ Test'
    `
  )
  .action(async function (/** @type {CloneEnvOption} */ opts) {
    const { application_name } = getLocalConfig();
    const ebclient = new ElasticBeanstalkClient();

    const cloned = await cloneEnvironment({
      ebclient,
      application_name,
      application_version_label: opts.version,
      env_name: opts.envName,
      from: opts.from,
      save_as: opts.saveAs,
      platform: opts.platform,
      platformArn: opts.platformArn,
      tags: {
        Product: opts.product,
      },
    });

    console.log(cloned);
  });

program.command("deploy")
  .description("Upload an application ZIP file, clone a saved configuration that allows you to change the platformArn and use it to launch a new environment.")
  .requiredOption("--version <version>", optionDescs.version)
  .requiredOption("--filepath <path>", optionDescs.filepath)
  .requiredOption("--product <tag>", "Adds a tag named 'Product' with the given value for application.")
  .option("--skip-if-exist", optionDescs.skipIfExist, false)
  .option("--platformArn [arn]", optionDescs.platformArn)
  .option("--platform [platform]", optionDescs.platform)
  .requiredOption("--from <saved-configuration-name>", optionDescs.from)
  .requiredOption("--save-as <template-name>", optionDescs.saveAs)
  .requiredOption("--env-name <environment-name>", "Name of the environment to launch with the new configuration.")
  .option("--env-product [tag]", optionDescs.envProduct)
  .addHelpText("after",
    `\nExamples:
    $ ${NAME} deploy \\
    --version v1.2.3 \\
    --filepath ./build/app.zip \\
    --product XYZ \\
    --platform 'Node.js 20' \\
    --from base-config \\
    --save-as new-config \\
    --env-name node-XYZ-test \\
    --env-product 'XYZ Test'
    `
  )
  .action(async function (/** @type {FullDeployOption} */ opts) {
    const { application_name } = getLocalConfig();
    const s3client = new S3Client();
    const ebclient = new ElasticBeanstalkClient();

    const uploaded = await uploadApplicationIfNotExist({
      ebclient,
      s3client,
      application_name,
      aws_s3_bucket,
      application_version_label: opts.version,
      filepath: opts.filepath,
      tags: {
        Product: opts.product,
      },
    });

    if (!opts.skipIfExist && !uploaded) {
      throw new Error(`error: the application version label '${opts.version}' already exisit. use the 'env:clone' instead or add --skip-if-exist option.`)
    }

    const cloned = await cloneEnvironment({
      ebclient,
      application_name,
      application_version_label: opts.version,
      env_name: opts.envName,
      from: opts.from,
      save_as: opts.saveAs,
      platform: opts.platform,
      platformArn: opts.platformArn,
      tags: {
        Product: opts.envProduct ?? opts.product,
      },
    });

    console.log(cloned);
  });

program.command("cfg:clone")
  .description("Clone a saved configuration that allows you to change the platformArn.")
  .requiredOption("--from <saved-configuration-name>", optionDescs.from)
  .requiredOption("--save-as <template-name>", optionDescs.saveAs)
  .option("--platformArn [arn]", optionDescs.platformArn)
  .option("--platform [platform]", optionDescs.platform)
  .option("--product [tag]", "Adds a tag named 'Product' with the given value. Default to the original configuration.")
  .action(async (/** @type {CloneConfigurationOption} */ opts) => {
    const { application_name } = getLocalConfig();
    const ebclient = new ElasticBeanstalkClient();
    const tags = { Product: opts.product };

    const cloned = await cloneSavedConfiguration({
      application_name,
      ebclient,
      from: opts.from,
      save_as: opts.saveAs,
      platform: opts.platform,
      platformArn: opts.platformArn,
      tags
    });

    console.log(cloned);
  });

program.command("app:upload")
  .description("Upload an application ZIP file.")
  .requiredOption("--version <version>", optionDescs.version)
  .requiredOption("--filepath <path>", optionDescs.filepath)
  .requiredOption("--product <tag>", "Adds a tag named 'Product' with the given value for application.")
  .action(async (/** @type {UploadApplicationOption} */ opts, _commander) => {
    const { application_name } = getLocalConfig(aws_eb_local_config_path);
    const s3client = new S3Client();
    const ebclient = new ElasticBeanstalkClient();

    const uploaded = await uploadApplicationIfNotExist({
      ebclient,
      s3client,
      application_name,
      aws_s3_bucket,
      application_version_label: opts.version,
      filepath: opts.filepath,
      tags: {
        Product: opts.product,
      },
    });

    if (uploaded) {
      console.log(uploaded);
    }
    else {
      console.log("Already exist");
    }
  })
  ;

program.command("app:deploy")
  .description("Upload an application ZIP file and deploy it to the current use environment (from `eb list`).")
  .requiredOption("--version <version>", optionDescs.version)
  .option("--product [tag]", "Adds a tag named 'Product' with the given value for application.")
  .option("--filepath [path]", optionDescs.filepath)
  .option("--skip-if-exist", optionDescs.skipIfExist, false)
  .action(async function (/** @type {DeployApplicationOption} */ opts) {
    const { application_name, environemnt_name } = getLocalConfig(aws_eb_local_config_path);
    const s3client = new S3Client();
    const ebclient = new ElasticBeanstalkClient();
    if (opts.filepath) {
      if (!opts.product) {
        throw new Error("error: the --product option is required when --filepath is provided.");
      }

      const uploaded = await uploadApplicationIfNotExist({
        ebclient,
        s3client,
        application_name,
        aws_s3_bucket,
        application_version_label: opts.version,
        filepath: opts.filepath,
        tags: {
          Product: opts.product,
        },
      });

      if (!opts.skipIfExist && !uploaded) {
        throw new Error(`error: The application version label '${opts.version}' already exists. remove the '--filepath' option or add '--skip-if-exists'.`);
      }
    }

    const deployed = await deployApplication(ebclient, environemnt_name, opts.version);

    console.log(deployed);
  })
  ;

program.parse(process.argv);

/**
 * @typedef {object} ApplicationVersion
 * @property {string} version
 */

/**
 * @typedef {object} UploadApplicationProperty
 * @property {string} filepath
 * @property {string} product
 * @property {boolean} skipIfExist
 */

/**
 * The options for `app:upload`.
 * @typedef {ApplicationVersion & UploadApplicationProperty} UploadApplicationOption
 */

/**
 * The options for `app:deploy`.
 * @typedef {ApplicationVersion & Partial<UploadApplicationProperty>} DeployApplicationOption
 */

/**
 * The options for `config:clone`.
 * @typedef {object} CloneConfigurationOption
 * @property {string} platformArn
 * @property {string} [platform]
 * @property {string} from
 * @property {string} saveAs
 * @property {string} product
 */

/**
 * @typedef {object} DeployEnvOptionProperty
 * @property {string} envProduct
 * @property {string} envName The environment name.
 */

/**
 * The options for `env:clone`.
 * @typedef {ApplicationVersion & CloneConfigurationOption & DeployEnvOptionProperty} CloneEnvOption
 */

/**
 * The options for `deploy`
 * @typedef {UploadApplicationOption & CloneConfigurationOption & DeployEnvOptionProperty} FullDeployOption
 */
