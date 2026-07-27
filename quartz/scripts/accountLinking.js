const fs = require("fs");
const { readJSON } = require("./utils.js");

// Account files are named "{type}:{identifier}.json" — e.g. "email:a@b.com",
// "google:a@b.com", "discord:someuser". The identifier differs per login
// method (Discord keys by username, not email), but every account stores the
// billing email in its `email` field, so that is what links them together.

const LOGIN_METHOD_LABELS = {
  email: "Email & Password",
  google: "Google",
  discord: "Discord",
};

function loginMethodLabel(type) {
  return LOGIN_METHOD_LABELS[type] || type || "another login method";
}

// "email:a@b.com.json" -> { file, name, type, identifier }
function parseAccountFile(file) {
  const name = file.replace(/\.json$/, "");
  if (!name.includes(":")) {
    // Legacy/solo accounts such as noemail.json have no login-method prefix.
    return { file, name, type: null, identifier: name };
  }
  const type = name.split(":")[0];
  const identifier = name.split(":").slice(1).join(":");
  return { file, name, type, identifier };
}

function getAllAccounts() {
  if (!fs.existsSync("accounts")) return [];

  const accounts = [];
  for (const file of fs.readdirSync("accounts")) {
    if (!file.endsWith(".json")) continue;
    let data;
    try {
      data = readJSON(`accounts/${file}`);
    } catch (e) {
      console.log(`[accountLinking] Could not read accounts/${file}: ${e.message}`);
      continue;
    }
    if (!data || !data.accountId) continue;
    accounts.push({ ...parseAccountFile(file), data });
  }
  return accounts;
}

// Every account whose billing email matches, optionally skipping one account
// file (used when checking "does anyone *else* already own this email?").
function findAccountsByEmail(email, options = {}) {
  if (!email) return [];
  const target = String(email).toLowerCase();
  const excludeName = options.excludeName || null;

  return getAllAccounts().filter((account) => {
    if (excludeName && account.name === excludeName) return false;
    if (!account.data.email) return false;
    return String(account.data.email).toLowerCase() === target;
  });
}

// Account file names ("email:a@b.com.json") that share this account's billing
// email, always including the account itself. Subscription state is recorded
// per owning account file, so anything resolving "is this paid for?" has to
// look across the whole group — otherwise a user who signed up twice sees a
// different answer depending on which login they used.
function getLinkedAccountFiles(accountName, accountData) {
  const self = `${accountName}.json`;
  if (!accountData || !accountData.email) return [self];

  const files = findAccountsByEmail(accountData.email).map((account) => account.file);
  if (!files.includes(self)) files.push(self);
  return files;
}

// Map of lowercased email -> accounts sharing it. Accounts with no email are
// skipped, since a blank email is not evidence that two accounts are the same
// person.
function groupAccountsByEmail() {
  const groups = new Map();
  for (const account of getAllAccounts()) {
    if (!account.data.email) continue;
    const key = String(account.data.email).toLowerCase();
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(account);
  }
  return groups;
}

// server.allowedAccounts is stored as a comma-separated string of accountIds
// (see /server/:id/allowAccount).
function parseAllowedAccounts(server) {
  if (typeof server.allowedAccounts !== "string") return [];
  return server.allowedAccounts.split(",").filter((id) => id !== "");
}

module.exports = {
  loginMethodLabel,
  parseAccountFile,
  getAllAccounts,
  findAccountsByEmail,
  getLinkedAccountFiles,
  groupAccountsByEmail,
  parseAllowedAccounts,
};
