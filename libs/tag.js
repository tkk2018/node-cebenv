// @ts-check

/**
 * Converts a plain JavaScript object into an array of AWS Tag objects.
 *
 * Each key-value pair in the input object becomes a `{ Key, Value }` tag.
 *
 * @param {Record<string, string>} o - The input object where keys and values represent tag names and values.
 * @returns {import("@aws-sdk/client-s3").Tag[]} An array of AWS-compatible tag objects.
 */
function objectToTags(o) {
  return Object.keys(o).map((key) => {
    return {
      Key: key, Value: o[key],
    };
  });;
}

/**
 * Formats a plain JavaScript object into an AWS tagging query string.
 *
 * Each key-value pair is URL-encoded and joined using `,`, producing a string like:
 * `key1=value1,key2=value2`.
 * https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/environment-configuration-savedconfig-tagging.html
 *
 * @param {Record<string, string>} o - The input object representing tag keys and values.
 * @returns {string} A URL-encoded query string suitable for AWS tagging APIs.
 */
function objectToTagging(o) {
  return Object.entries(o)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join(",");
    ;
}

module.exports = {
  objectToTagging,
  objectToTags,
};
