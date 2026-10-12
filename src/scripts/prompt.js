import readline from 'readline';

/**
 * Ask a question on the terminal and resolve with the trimmed answer.
 * @param {string} question
 * @returns {Promise<string>}
 */
const ask = (question) =>
  new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });

const ENTER = new Set(['\r', '\n']);
const BACKSPACE = new Set(['\u007f', '\b']);
const CTRL_C = '\u0003';

/**
 * Ask for a secret without echoing it: each typed character shows as "*".
 * Needs a real TTY (raw mode). Ctrl+C rejects with "Cancelled".
 * @param {string} question
 * @returns {Promise<string>}
 */
const askHidden = (question) =>
  new Promise((resolve, reject) => {
    const { stdin, stdout } = process;
    let value = '';
    let onData;

    const finish = (settle) => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener('data', onData);
      stdout.write('\n');
      settle();
    };

    /** @returns {boolean} true once input is finished */
    const handleChar = (char) => {
      if (ENTER.has(char)) {
        finish(() => resolve(value));
        return true;
      }
      if (char === CTRL_C) {
        finish(() => reject(new Error('Cancelled')));
        return true;
      }
      if (BACKSPACE.has(char)) {
        if (value) {
          value = value.slice(0, -1);
          stdout.write('\b \b');
        }
        return false;
      }
      value += char;
      stdout.write('*');
      return false;
    };

    // A paste arrives as one chunk; stop at the first Enter / Ctrl+C.
    onData = (chunk) => {
      Array.from(chunk).some(handleChar);
    };

    stdout.write(question);
    stdin.setRawMode(true);
    stdin.setEncoding('utf8');
    stdin.resume();
    stdin.on('data', onData);
  });

export { ask, askHidden };
