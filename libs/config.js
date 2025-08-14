/**
 * - Unable to create a configuration template using the ConfigurationSettingsDescription (from DescribeConfigurationSettingsCommand).
 *   The CreateConfigurationTemplateCommand throws multiple InvalidParameterValue errors, likely due to data type differences—even though no type errors are reported.
 */

// @ts-check

const fs = require("fs-extra");
const path = require("path");
const {
  CreateConfigurationTemplateCommand,
  DescribeConfigurationSettingsCommand,
  ElasticBeanstalkClient,
  ListPlatformVersionsCommand,
  // SwapEnvironmentCNAMEsCommand,
} = require("@aws-sdk/client-elastic-beanstalk");
const _ = require("lodash");
const jsyaml= require("js-yaml");
const { asyncExec } = require("../helpers/async-child-process");
const { selectPromptRemotePage } = require("../helpers/interactive");
const { objectToTags } = require("./tag");

const default_dot_elasticbeanstalk = {
  directory_name: `.${path.sep}.elasticbeanstalk`,
  saved_configs: `.${path.sep}.elasticbeanstalk${path.sep}saved_configs`,
  config: `config.yml`,
};

/**
 * @param {<T>(command: string) => Promise<T>} runner
 * @param {string} saved_configuration_name The saved configuration name
 * @param {object} [option]
 * @param {string} [option.save_as] Unsafe. Rename the downloaded configuration file. Note the `.cfg.yml` will be appended automatically.
 */
async function _ebConfigGet(runner, saved_configuration_name, option) {
  try {
    /** @type {string} */
    const output = await runner(`eb config get ${saved_configuration_name}`);
    // "Configuration saved at: /path/to/project-root/.elasticbeanstalk/saved_configs/saved_configuration_name.cfg.yaml"
    const [ key, val ] = output.trim().split(":");
    const trimmed_val = val.trim();
    if ("Configuration saved at" !== key || !await fs.exists(trimmed_val)) {
      throw new Error(output);
    }

    const configuration_saved_at = trimmed_val;

    const dest = option?.save_as
      ? `${path.dirname(configuration_saved_at)}${path.sep}${option.save_as}.cfg.yml`
      : configuration_saved_at
      ;

    if (option?.save_as) {
      await runner(`mv ${configuration_saved_at} ${dest}`);
    }

    /** @type {Record<string, any>} */
    const parsed = jsyaml.load(await fs.readFile(dest, "utf8"));
    return {
      name: saved_configuration_name,
      path: dest,
      option: parsed,
    };
  }
  catch (e) {
    throw new Error(e);
  }
}

/**
 * @param {(command: string) => Promise<void>} runner
 * @param {string} configuration_name
 */
async function _ebConfigPut(runner, configuration_name) {
  try {
    if (!configuration_name) {
      throw new Error("Missing configuration name.");
    }

    const _ = await runner(`eb config put ${configuration_name}`);
    // output = void
    return;
  }
  catch (e) {
    throw new Error(e);
  }
}

/**
 * The `eb config put` command doesn't support the --tags option.
 *
 * @param {(command: string) => Promise<void>} runner
 * @param {object} configuration
 * @param {string} configuration.template_name The saved configuration name
 * @param {Record<string, any>} configuration.template The template configuration to save.
 * @param {Pick<typeof default_dot_elasticbeanstalk, "saved_configs">} [option] The local elasticbeanstalk directory structure.
 */
async function ebConfigPutConfiguration(runner, configuration, option) {
  const formatted = jsyaml.dump(configuration.template);
  const dir = option?.saved_configs ?? default_dot_elasticbeanstalk.saved_configs;
  /**
   * The new configuration file in local machine
   */
  const dest = `${dir}${path.sep}${configuration.template_name}.cfg.yml`;
  await fs.writeFile(dest, formatted, "utf8");

  await _ebConfigPut(runner, configuration.template_name);
  return {
    template_name: configuration.template_name,
    dest,
  };
}

/**
 * @param {ElasticBeanstalkClient} eb
 * @param {object} [param]
 * @param {object} [param.platform_name] "Node.js", "Node.js 20"
 * @param {string} [param.NextToken]
 */
async function listPlatformVersions(eb, param) {
  const Filters = param?.platform_name
    ? [
      { Type: "PlatformName", Operator: "contains", Values: [param.platform_name] }
    ]
    : undefined
    ;

  const result = await eb.send(new ListPlatformVersionsCommand({ Filters, NextToken: param?.NextToken }));
  return result;
}

/**
 * Interactive prompt for the user to select a platform ARN based on the provided hint (`platform_name`).
 *
 * @param {ElasticBeanstalkClient} eb
 * @param {string} [platform_name] "Node.js", "Node.js 20"
 * @returns {Promise<string | undefined>} The selected platform ARN.
 */
async function selectPlatformArn(eb, platform_name) {
  /** @type {string | undefined} */
  const plaftormArn = await selectPromptRemotePage("Choose one:", async (nextToken) => {
    const { NextToken, PlatformSummaryList } = await listPlatformVersions(eb, {
      platform_name,
      NextToken: nextToken,
    });

    if (!PlatformSummaryList || PlatformSummaryList.length == 0) {
      return;
    }

    const plaftormArns = /** @type {string[]} */ (PlatformSummaryList
      .filter((s) => !!s.PlatformArn) // remove where the platformArn value is falsy.
      .map((s) => s.PlatformArn) // retrive the platformArn
    );

    return { options: plaftormArns, next: NextToken };
  });

  return plaftormArn;
}

/**
 * Get the configuration based on the application name and (environment name or configuration template name).
 *
 * @param {ElasticBeanstalkClient} eb
 * @param {object} param
 * @param {string} param.application_name
 * @param {string} [param.environment_name]
 * @param {string} [param.configuration_template_name]
 */
async function getSavedConfigurationSmart(eb, param) {
  if (param.configuration_template_name) {
    return getSavedConfiguration(eb, param.application_name, param.configuration_template_name);
  }

  if (param.environment_name) {
    return getUsedEnvironmentConfiguration(eb, param.application_name, param.environment_name);
  }

  throw new Error("Require at least configuration template name or environment name.");
}

/**
 * Find the configuration based on the application name and (environment name or configuration template name).
 *
 * @param {ElasticBeanstalkClient} eb
 * @param {object} param
 * @param {string} param.application_name
 * @param {string} [param.environment_name]
 * @param {string} [param.configuration_template_name]
 * @throws {Error} The specific environment configuration not found.
 */
async function findSavedConfiguration(eb, param) {
  const config = await getSavedConfigurationSmart(eb, param);
  if (!config) {
    throw new Error("The 'EnvironmentConfiguration' not found.");
  }
  return config;
}

/**
 * Get the configuration currently in use. The active environment can be determined by running `eb list`.
 *
 * @param {ElasticBeanstalkClient} eb
 * @param {string} application_name
 * @param {string} environment_name
 */
async function getUsedEnvironmentConfiguration(eb, application_name, environment_name) {
  const result = await eb.send(new DescribeConfigurationSettingsCommand({
    ApplicationName: application_name,
    EnvironmentName: environment_name,
  }));
  return result.ConfigurationSettings?.at(0);
}

/**
 * @param {ElasticBeanstalkClient} eb
 * @param {string} application_name
 * @param {string} configuration_name
 */
async function getSavedConfiguration(eb, application_name, configuration_name) {
  try {
    const result = await eb.send(new DescribeConfigurationSettingsCommand({
      ApplicationName: application_name,
      TemplateName: configuration_name,
    }));

    return result.ConfigurationSettings?.at(0);
  }
  catch (e) {
    // handle "InvalidParameterValue: No Configuration Template named '${application_name}/${configuration_name}' found."
    if (
      // "Type" in e
      // && "Code" in e
      "message" in e
      // && "Sender" === e.type
      // && "InvalidParameterValue" === e.Code
      && e.message
      && e.message === `No Configuration Template named '${application_name}/${configuration_name}' found.`
    ) {
      return undefined;
    }

    throw e;
  }
}

/**
 * Clones an existing Elastic Beanstalk environment configuration and saves it under a new template name.
 *
 * Validates the new template name, ensures it doesn't already exist, optionally updates the platform ARN,
 * and persists the cloned configuration.
 *
 * @param {ElasticBeanstalkClient} eb
 * @param {object} param
 * @param {string} param.application_name The name of the Elastic Beanstalk application.
 * @param {string} param.from The name of the existing configuration template to clone.
 * @param {string} param.save_as The name to assign to the cloned configuration template.
 * @param {{ platformArn: string }} [properties] Optional overrides, such as a new platform ARN.
 * @throws Will throw an error if the new template name is invalid or already exists.
 */
async function cloneSavedConfiguration(eb, param, properties) {
  if (!isValidTemplateName(param.save_as)) {
    throw new Error(`Invalid "save_as". Only alphanumeric characters, hyphens (-) and underscore (_) are permitted.`);
  }

  const exist = await getSavedConfiguration(eb, param.application_name, param.save_as);
  if (exist) {
    throw new Error(`The configuration name "${param.save_as}" already used.`);
  }

  const config = await _ebConfigGet((cmd) => asyncExec(cmd), param.from);

  // remove the DateCreated and DateModified
  delete config.option.EnvironmentConfigurationMetadata;

  if (properties?.platformArn) {
    config.option.Platform.PlatformArn = properties.platformArn;
  }

  const saved = await ebConfigPutConfiguration(async (cmd) => {
    return asyncExec(cmd);
  }, {
    template: config.option,
    template_name: param.save_as,
  });

  /** @type {Record<string, any>} */
  const parsed = jsyaml.load(await fs.readFile(saved.dest, "utf8"));

  const result = Object.assign({}, saved, { option: parsed });
  return result;
}

/**
 * This will mutate the {@param config}.
 *
 * @param {import("@aws-sdk/client-elastic-beanstalk").ConfigurationSettingsDescription} config
 * @param {`${string}=${string}`} overwrite
 */
async function setConfig(config, overwrite) {
  const [key, value] = overwrite.split("=");
  _.set(config, key, value);
}

/**
 * This will mutate the {@param config}.
 *
 * @param {import("@aws-sdk/client-elastic-beanstalk").ConfigurationSettingsDescription} config
 * @param {`${string}=${string}`[]} overwrites
 */
async function setConfigs(config, overwrites) {
  for (const entry of overwrites) {
    setConfig(config, entry);
  }
}

/**
 * @param {import("@aws-sdk/client-elastic-beanstalk").ConfigurationSettingsDescription} config
 * @param {Partial<import("@aws-sdk/client-elastic-beanstalk").ConfigurationSettingsDescription>} overwrite
 */
async function mergeWith(config, overwrite) {
  const merged = _.merge({}, config, overwrite);
  return merged;
}

/**
 * @param {ElasticBeanstalkClient} eb
 * @param {import("@aws-sdk/client-elastic-beanstalk").ConfigurationSettingsDescription
 *   & Required<Pick<import("@aws-sdk/client-elastic-beanstalk").ConfigurationSettingsDescription, "ApplicationName">>
 * } config
 * @param {string} template_name
 * @param {Record<string, string>} [tags]
 */
async function saveConfiguration(eb, config, template_name, tags) {
  const template = Object.assign({}, config, { TemplateName: template_name, Tags: tags ? objectToTags(tags) : undefined, });
  if (!template.ApplicationName) {
    throw new Error("The 'ApplicaitonName' is undefined.");
  }

  const result = await eb.send(new CreateConfigurationTemplateCommand(template));
  return result;
}

/**
 * @param {string} [name] [Max 100](https://docs.aws.amazon.com/elasticbeanstalk/latest/api/API_CreateConfigurationTemplate.html#API_CreateConfigurationTemplate_RequestParameters)
 * @return {boolean}
 */
function isValidTemplateName(name) {
  if (!name) {
    return false;
  }

  return name.length < 100 && /^[a-zA-Z0-9-_]+$/.test(name);
}

module.exports = {
  cloneSavedConfiguration,
  ebConfigPutConfiguration,
  findSavedConfiguration,
  getSavedConfiguration,
  getSavedConfigurationSmart,
  getUsedEnvironmentConfiguration,
  isValidTemplateName,
  listPlatformVersions,
  mergeWith,
  saveConfiguration,
  selectPlatformArn,
  setConfig,
  setConfigs,
};
