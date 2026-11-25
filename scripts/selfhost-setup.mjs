#!/usr/bin/env node
import { createInterface } from 'node:readline/promises';
import { runSelfhostSetup } from './selfhost-setup/lib.mjs';

/**
 * Prompt for a line of text with an optional default value.
 * @param {string} label
 * @param {string} [defaultValue]
 * @returns {Promise<string>}
 */
async function promptText(label, defaultValue) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const suffix = defaultValue ? ` [${defaultValue}]` : '';
    const answer = await rl.question(`${label}${suffix}: `);
    return answer.trim() || defaultValue || '';
  } finally {
    rl.close();
  }
}

/**
 * Prompt for a yes/no confirmation.
 * @param {string} label
 * @param {boolean} [defaultYes]
 * @returns {Promise<boolean>}
 */
async function promptConfirm(label, defaultYes = true) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const hint = defaultYes ? '[Y/n]' : '[y/N]';
    const answer = (await rl.question(`${label} ${hint}: `)).trim().toLowerCase();
    if (!answer) return defaultYes;
    return answer === 'y' || answer === 'yes';
  } finally {
    rl.close();
  }
}

/**
 * Prompt for a secret with hidden terminal input when stdin is a TTY.
 * @param {string} label
 * @returns {Promise<string>}
 */
function promptSecret(label) {
  if (!process.stdin.isTTY) {
    return promptText(label);
  }

  return new Promise((resolvePromise, rejectPromise) => {
    const stdin = process.stdin;
    const stdout = process.stdout;
    let value = '';
    const wasRaw = stdin.isRaw;

    stdout.write(`${label}: `);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    const cleanup = () => {
      stdin.removeListener('data', onData);
      if (stdin.isTTY) {
        stdin.setRawMode(Boolean(wasRaw));
      }
      stdin.pause();
    };

    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === '\u0003') {
          // Ctrl+C
          cleanup();
          stdout.write('\n');
          rejectPromise(new Error('Setup cancelled by user.'));
          return;
        }
        if (ch === '\r' || ch === '\n') {
          cleanup();
          stdout.write('\n');
          resolvePromise(value);
          return;
        }
        if (ch === '\u007f' || ch === '\b') {
          if (value.length > 0) {
            value = value.slice(0, -1);
          }
          continue;
        }
        if (ch >= ' ') {
          value += ch;
        }
      }
    };

    stdin.on('data', onData);
  });
}

try {
  await runSelfhostSetup({
    argv: process.argv.slice(2),
    prompt: promptText,
    promptSecret,
    promptConfirm,
  });
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[selfhost-setup] Error: ${message}`);
  process.exit(1);
}
