// @ts-check

const { EOL } = require("node:os");
const readline = require("readline");

/**
 * @param {string} description
 * @param {string[]} options
 * @param {boolean} [next]
 * @param {boolean} [back]
 * @returns
 */
const promptOptions = (description, options, next, back) => {
  const choices = options
    .map((opt, i) => `${i}) ${opt}`)
    .join(EOL);

  const nextHint = next ? `${EOL}${"Or type 'Next' to continue"}` : "";
  const backHint = back ? `${EOL}${"OR type 'Back' to go back"}` : "";
  const hintSeperator = (nextHint || backHint) ? `${EOL}` : "";

  return `${EOL}${description}${EOL}${choices}${hintSeperator}${nextHint}${backHint}${EOL}${EOL}> `;
};

/**
 * @param {string} description
 * @param {string[]} options
 */
async function selectPrompt(description, options) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const ask = () =>
    new Promise((resolve) => {
      rl.question(promptOptions(description, options), (answer) => {
        const index = parseInt(answer.trim(), 10);
        if (index >= 0 && index < options.length) {
          rl.close();
          resolve(options[index]);
        }
        else {
          console.log("❌ Invalid selection. Try again.");
          resolve(ask()); // Recursively ask again
        }
      });
    });

  return await ask();
}

/**
 * @param {string} description
 * @param {(nextToken: string) => Promise<{options: string[]; next?: string} | undefined>} fn
 * @returns {Promise<string | undefined>}
 */
async function selectPromptRemotePage(description, fn) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const memory = new Map();

  const ask = (page, nextToken) =>
    new Promise(async (resolve) => {
      const data = memory.get(page) ?? await fn(nextToken);
      if (!data) {
        return resolve(undefined);
      }
      memory.set(page, data);

      const { options, next } = data;
      const back = 0 <= (page - 1);

      rl.question(promptOptions(description, options, !!next, back), (answer) => {
        const trimmed = answer.trim().toLowerCase();

        const index = parseInt(trimmed, 10);
        if (!isNaN(index) && index >= 0 && index < options.length) {
          rl.close();
          return resolve(options[index]);
        }

        if (trimmed === "next" && next) {
          return resolve(ask(page + 1, next)); // Continue to next page
        }

        if (trimmed === "back" && back) {
          return resolve(ask(page - 1));
        }

        console.log("❌ Invalid selection. Try again.");
        return resolve(ask(page, nextToken)); // Replay current page
      });
    });

  return await ask(0);
}

module.exports = {
  selectPrompt,
  selectPromptRemotePage,
};
