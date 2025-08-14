// @ts-check

const {
  ElasticBeanstalkClient,
  UpdateEnvironmentCommand,
  CreateEnvironmentCommand,
  // SwapEnvironmentCNAMEsCommand,
} = require("@aws-sdk/client-elastic-beanstalk");
const { objectToTags } = require("./tag");

/**
 * Update current environment.
 *
 * @param {ElasticBeanstalkClient} eb
 * @param {string} envName
 * @param {string} versionLabel
 */
async function deployNewApplicationVersion(eb, envName, versionLabel) {
  return eb.send(new UpdateEnvironmentCommand({
    EnvironmentName: envName,
    VersionLabel: versionLabel,
  }));
}

/**
 * @param {ElasticBeanstalkClient} eb
 * @param {Pick<import("@aws-sdk/client-elastic-beanstalk").CreateEnvironmentCommandInput, "ApplicationName" | "EnvironmentName" | "VersionLabel" | "TemplateName" | "CNAMEPrefix">} param
 * @param {Record<string, string>} [tags]
 */
async function deployNewEnvironment(eb, param, tags) {
  const Tags = tags
    ? objectToTags(tags)
    : undefined
    ;

  return eb.send(new CreateEnvironmentCommand(Object.assign({}, param, { Tags })));
}

module.exports = {
  deployNewApplicationVersion,
  deployNewEnvironment,
};
