// @ts-check

/**
 * Helper: Run shell commands
 *
 * @param {string} cmd
 */
function asyncExec(cmd) {
  return new Promise((resolve, reject) => {
    require('child_process').exec(cmd, (err, stdout, stderr) => {
      if (err) reject(stderr);
      else resolve(stdout);
    });
  });
}

module.exports = {
  asyncExec,
};
