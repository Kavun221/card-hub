/*
 * ============================================================================
 *  set-password.js – create or change the password for the private cards.
 * ============================================================================
 *  Run in the card-hub folder:
 *      node server/set-password.js            create / change the password
 *      node server/set-password.js --remove   delete it (private cards are then closed)
 *
 *  What is saved: data/auth.json with a random salt and the scrypt HASH of the
 *  password – never the password itself. data/ is git-ignored, so it stays on
 *  this PC. Restart the server after changing the password (this also logs
 *  out every open session).
 * ============================================================================
 */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const readline = require('readline');
const { AUTH_FILE, DATA_DIR, SCRYPT, hashPassword } = require('./auth');

if (process.argv.includes('--remove')) {
  try { fs.unlinkSync(AUTH_FILE); console.log('Password removed. Private cards are closed until you set a new one.'); }
  catch { console.log('No password was set.'); }
  process.exit(0);
}

// Ask for a password without showing what you type
function askHidden(question) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = s => { if (s.includes(question)) rl.output.write(s); else if (!/[\r\n]/.test(s)) rl.output.write('*'); };
    rl.question(question, answer => { rl.close(); process.stdout.write('\n'); resolve(answer); });
  });
}

(async () => {
  console.log('Set the password for your private Card Hub cards.');
  console.log('Use at least 10 characters (a short sentence is easy to remember and strong).\n');
  const a = await askHidden('New password: ');
  if (a.length < 10) { console.log('Too short – use at least 10 characters. Nothing was saved.'); process.exit(1); }
  const b = await askHidden('Repeat password: ');
  if (a !== b) { console.log('The two passwords are different. Nothing was saved.'); process.exit(1); }

  const salt = crypto.randomBytes(16).toString('hex');
  const record = {
    algo: 'scrypt',
    params: { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, keylen: SCRYPT.keylen },
    salt,
    hash: hashPassword(a, salt),
    created: new Date().toISOString()
  };
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(AUTH_FILE, JSON.stringify(record, null, 2), { mode: 0o600 });
  console.log(`Saved (hash only) in ${AUTH_FILE}`);
  console.log('Restart the server, then open the Converter card and log in.');
})();
