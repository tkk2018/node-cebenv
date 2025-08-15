// @ts-check

/**
 * Helper: Run shell commands
 *
 * @param {string} cmd
 * @param {(import('fs').ObjectEncodingOptions & import('child_process').ExecOptions) | undefined | null} [option]
 */
function asyncExec(cmd, option) {
  return new Promise((resolve, reject) => {
    require('child_process').exec(cmd, option, (err, stdout, stderr) => {
      if (err) reject(stderr);
      else resolve(stdout);
    });
  });
}

module.exports = {
  asyncExec,
};
