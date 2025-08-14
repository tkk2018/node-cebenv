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

## Install

```
npm install -D https://github.com/tkk2018/node-cebenv
```

## Usage

```
npx cebenv -h
```
