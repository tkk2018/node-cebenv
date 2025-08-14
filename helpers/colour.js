// @ts-check

/**
 * @param {string} message
 */
function instruction(message) {
  return (`\u001b[1;36m${message}\u001b[0m`);
};

/**
 * @param {string} message
 */
function answer(message) {
  return(`\u001b[1;35m${message}\u001b[0m`);
};

/**
 * @param {string} error
 */
function error(error) {
  return(`\u001b[1;31m${error}\u001b[0m`);
};

/**
 * @param {string} warn
 */
function warn(warn) {
  return(`\u001b[1;33m${warn}\u001b[0m`);
};

/**
 * @param {string} message
 */
function done(message) {
  return(`\u001b[1;32m${message}\u001b[0m`);
};

module.exports = {
  answer,
  done,
  error,
  instruction,
  warn,
};
