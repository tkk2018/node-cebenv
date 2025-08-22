# cebenv (Clone EB Environment)

The main purpose of this is to upgrade the `platformArn` programmatically.

The eb clone environment feature does not allow changing the platformArn, so developers typically need to create a new environment and manually reconfigure everything.

This tool simplifies that process by cloning from a **Saved Configuration** you provide, updating only the `platformArn`, saving it as a new configuration, and then creating a new temporary environment using that updated configuration. This way, you don’t need to go through the configuration steps manually.

After verifying the new environment, you can simply swap the CNAME.

## Limitations

- Only works with an existing configuration.

## Prerequisites

Before proceeding, make sure you have the following set up:

1. Install the AWS CLI

   Follow the [official instructions](https://github.com/aws/aws-cli) to install the CLI on your system.

2. Install the AWS Elastic Beanstalk CLI (EB CLI)

   Follow the [official instructions](https://github.com/aws/aws-elastic-beanstalk-cli) to install the CLI on your system.

3. Configure AWS Credentials and Access Keys

   After installing, configure your AWS credentials by running:

   ```
   aws configure
   ```

   You'll be prompted to enter:

    - AWS Access Key ID
    - AWS Secret Access Key
    - Default region name
    - Default output format (optional)

   These credentials are required for the EB CLI to interact with your AWS account.

4. Configure eb cli

   ```
   eb init
   ```

   This command initializes your Elastic Beanstalk project in the current directory. It sets up the .elasticbeanstalk/config.yml file, which stores your application and environment settings.

   You'll be prompted to enter:

    - AWS region
    - Application name: Choose your exisiting application.
    - Default environment: This can be changed later using `eb use <environment-name>`.

## Install

```
npm install -D https://github.com/tkk2018/node-cebenv
```

## Usage

```
npx cebenv -h
```

## Useful Tips

To view all environments associated with your application:

```
eb list
```

If your application has multiple environments (e.g., production, testing), switch between them using:

```
eb use env-name
```

To list saved environment configurations:

```
eb config list
```

To download a specific configuration:

```
eb config get config-name
```

By default, the downloaded configuration will be saved to `./.elasticbeanstalk/saved_configs/config-name.cfg.yml`.

After editing the downloaded config, upload it as a new configuration:

```
eb config put new-config-name
```

Then, create a new environment using that configuration:

```
eb create new-env-name --cfg my-config
```

List available `platformArn`

```
aws elasticbeanstalk list-platform-versions
```

To filter for Node.js platforms only:

```
aws elasticbeanstalk list-platform-versions --query "PlatformSummaryList[?PlatformCategory=='Node.js']"
```

View application versions

```
aws elasticbeanstalk describe-application-versions --application-name application-name
```

Upload source bundle to S3

```
aws s3 cp ./build/${filename}.zip s3://elasticbeanstalk-${region}-${random-id}/${filename}.zip
```

The S3 bucket/name `elasticbeanstalk-${region}-${random-id}` is automatically generated when you first upload an application via the AWS Web Console. You can locate it by navigating to the S3 service in the console and filtering for buckets that contain `elasticbeanstalk` in their name.

Create a new application version by using the uploaded source from S3

```
aws elasticbeanstalk create-application-version \
  --application-name my-app \
  --version-label v1 \
  --source-bundle S3Bucket=elasticbeanstalk-${region}-${random-id},S3Key=${filename}.zip
```

