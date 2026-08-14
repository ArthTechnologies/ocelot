const express = require("express");
const Router = express.Router();
const fs = require("fs");
const s = require("../scripts/stripe.js");
const base62 = require("base62/lib/ascii");

const { v4: uuidv4 } = require("uuid");
const files = require("../scripts/files.js");
const accountLinking = require("../scripts/accountLinking.js");

const writeJSON = require("../scripts/utils.js").writeJSON;
const config = require("../scripts/utils.js").getConfig();
const readJSON = require("../scripts/utils.js").readJSON;
const pathTraversal = require("../scripts/security/pathtraversal.js");
const security = require("../scripts/security/rce.js");
const enableCloudflareVerify = JSON.parse(config.enableCloudflareVerify);
const mode = config.mode;

const nodeName = config.nodeName || "quartz";  

// One email = one account. Signing up a second time under a different login
// method would split a user's servers across two accounts, so signup is
// refused and the caller is told which method the existing account uses.
// `currentName` is the account file this signup would create (e.g.
// "google:a@b.com"), which must not count as a conflict with itself.
function findConflictingAccount(email, currentName) {
  if (!email) return null;
  const existing = accountLinking.findAccountsByEmail(email, { excludeName: currentName });
  if (existing.length === 0) return null;

  const match = existing[0];
  const label = accountLinking.loginMethodLabel(match.type);
  return {
    token: -1,
    duplicateAccount: true,
    existingLoginMethod: match.type,
    existingLoginMethodLabel: label,
    reason:
      `An account for ${email} already exists using ${label}. ` +
      `Sign in with ${label} instead, or use a different email address.`,
  };
}

// A nonexistent (or path-rejected) account resolves via readJSON to {},
// whose .token is undefined - comparing that against an omitted token
// header used to pass every one of the checks below, letting an
// unauthenticated request "authenticate" as an account that was never
// actually created. Requiring token to be a non-empty string first closes
// that off without changing behavior for any real, already-authenticated
// request (a real token is always a non-empty uuid).
function validToken(token, account) {
  return typeof token === "string" && token.length > 0 && token === account.token;
}

// cloudflareVerifyToken is attacker-controlled (req.query) and used to be
// interpolated straight into a single-quoted exec() curl string - a single
// quote in it broke out of that quoting into arbitrary shell execution.
// security.curl runs curl via execFile (no shell), and URLSearchParams
// percent-encodes the token before it ever reaches curl, so neither of
// those escapes is possible here regardless of what the token contains.
function verifyTurnstile(token, callback) {
  const params = new URLSearchParams({
    secret: config.cloudflareVerifySecretKey,
    response: token,
  });
  security
    .curl(["-s", "https://challenges.cloudflare.com/turnstile/v0/siteverify", "--data", params.toString()])
    .then(({ stdout }) => {
      try {
        callback(JSON.parse(stdout).success === true);
      } catch {
        callback(false);
      }
    })
    .catch(() => callback(false));
}

function writeAccount(id, username, billingEmail, servers, stripeServers, freeServers, lastSignin, token, salt, password, resetAttempts) {
  let tsv = fs.readFileSync("accounts.tsv", "utf8").split("\n");
  let row = [id, username, billingEmail, servers, stripeServers, freeServers, lastSignin, token, salt, password, resetAttempts].join("\t") + "\n";
  let alreadyExists = false;
  for (let i in tsv) {
    if (tsv[i].split("\t")[0] == id) {
      alreadyExists = true;
      tsv[i] = row;
    }
  }
  if (!alreadyExists) {
    tsv.push(row);
  }
  fs.writeFileSync("accounts.tsv", tsv.join("\n"));

}
Router.post("/email/signup/", (req, res) => {
  res.header("Access-Control-Allow-Origin", "*");

  let account = {};
  let emailExists = false;
  let password = req.body.password;
  let email = req.query.username;
  if (email.includes("email:")) email = email.replace("email:", "");
  let confirmPassword = req.body.confirmPassword;
  let cloudflareVerifyToken = req.query.cloudflareVerifyToken;
  if (enableCloudflareVerify) {
    verifyTurnstile(cloudflareVerifyToken, (success) => {
      if (success) {
        signup();
      } else {
        res.status(400).send({ token: -1, reason: "Human Verification Failed" });
      }
    });
  } else {
    signup();
  }
  function signup() {

    email = email.toLowerCase();
    if (email.includes("email:")) email = email.replace("email:", "");
    const emailPath = pathTraversal.accountFilePath("email", email);
    if (emailPath === null) {
      return res.status(400).send({ token: -1, reason: "Invalid email" });
    }
    try {
      if (fs.existsSync(emailPath)) {
        emailExists = true;
      }

      if (password == confirmPassword) {
        if (password.length >= 7) {
          if (!emailExists) {
            const conflict = findConflictingAccount(email, "email:" + email);
            if (conflict) {
              return res.status(400).send(conflict);
            }

            let accountId = "acc_"+Buffer.from(nodeName + (nodeName.includes("*email:") ? "" : "*email:") + email.substring(0, 7)).toString('base64url');
            [salt, password] = files.hash(password).split(":");

            account.password = password;
            account.accountId = accountId;
            account.token = uuidv4();
            account.salt = salt;
            account.resetAttempts = 0;
            account.ips = [];
            account.ips.push(files.getIPID(req.ip));
            account.type = "email";
            account.servers = [];
            account.email = email;
            account.freeServers = 0;
            account.lastSignin = new Date().getTime();
;
            writeJSON(emailPath, account);
            writeAccount(account.accountId, "email:"+email, email, account.servers, 0, account.freeServers, account.lastSignin, account.token, account.salt, account.password, account.resetAttempts);
            res
              .status(200)
              .send({ token: account.token, accountId: accountId });
          } else {
            res.status(400).send({ token: -1, reason: "Email already exists" });
          }
        } else {
          res.status(400).send({ token: -1, reason: "Password is too short" });
        }
      } else {
        res.status(400).send({ token: -1, reason: "Passwords do not match" });
      }
    } catch (err) {
      console.log(err);
      res.status(500).send({ token: -1, reason: "An error occurred" });
    }
  }
});

Router.post("/email/signin/", (req, res) => {
  res.header("Access-Control-Allow-Origin", "*");

  let password = req.body.password;
  let email = req.query.username;
  if (email.includes("email:")) email = email.replace("email:", "");
  const emailPath = pathTraversal.accountFilePath("email", email);
  if (emailPath === null) {
    return res.status(400).send({ token: -1, reason: "Incorrect email or password" });
  }
  let account = readJSON(emailPath);
  let response = {};

  let salt = account.salt;
  let cloudflareVerifyToken = req.query.cloudflareVerifyToken;
  if (enableCloudflareVerify) {
    console.log(account.password, files.hash(password, salt).split(":")[1]);
    if (account.password != files.hash(password, salt).split(":")[1]) {
      res.status(400).send({ token: -1, reason: "Incorrect email or password" });
    } else {
      verifyTurnstile(cloudflareVerifyToken, (success) => {
        if (success) {
          signin();
        } else {
          res.status(400).send({ token: -1, reason: "Human Verification Failed" });
        }
      });
    }
  } else {
    signin();
  }
  function signin() {
    if (account.password == files.hash(password, salt).split(":")[1]) {
      if (account.ips.indexOf(files.getIPID(req.ip)) == -1) {
        account.ips.push(files.getIPID(req.ip));
      }
      response = {
        token: account.token,
        accountId: account.accountId,
      };
      account.lastSignin = new Date().getTime();

      writeJSON(emailPath, account);
    } else {
      response = { token: -1, reason: "Incorrect email or password" };
    }

    res.status(200).send(response);
  }
});

Router.delete("/email", (req, res) => {
  let email = req.headers.username;
  if (email.includes("email:")) email = email.replace("email:", "");
  let password = req.body.password;
  let token = req.headers.token;
  const emailPath = pathTraversal.accountFilePath("email", email);
  if (emailPath === null) {
    return res.status(400).send({ success: false, reason: "Invalid token" });
  }
  let account = readJSON(emailPath);

  if (validToken(token, account)) {
    if (account.password == files.hash(password, account.salt).split(":")[1]) {
      for (let i in account.servers) {
        files.removeDirectoryRecursiveAsync("servers/" + account.servers[i]);
      }
      fs.unlinkSync(emailPath);

      res.status(200).send({ success: true });
    } else {
      res.status(400).send({ success: false, reason: "Incorrect password" });
    }
  } else {
    res.status(400).send({ success: false, reason: "Invalid token" });
  }
});

Router.post("/changeToEmail", (req, res) => {
  let email = req.query.email;
  let username = req.headers.username;
  let token = req.headers.token;
  let password = req.body.password;

  // username names the whole account file directly (e.g. "discord:someuser")
  // - accountFilePathFromKey confines it to accounts/ instead of trusting it
  // as-is, which otherwise lets ".." in the header reach any JSON file on
  // the host the process can read/write, not just other accounts.
  const usernamePath = pathTraversal.accountFilePathFromKey(username);
  const newEmailPath = typeof username === "string"
    ? pathTraversal.accountFilePath("email", username.split(":")[1])
    : null;
  if (usernamePath === null || newEmailPath === null) {
    return res.status(400).send({ success: false, reason: "Invalid token" });
  }
  let account = readJSON(usernamePath);

  if (validToken(token, account)) {
    account.email = email;
    account.password = files.hash(password).split(":")[1];
    account.salt = files.hash(password).split(":")[0];
    writeJSON(newEmailPath, account);
    writeAccount(account.accountId, "email:"+username.split(":")[1], email, account.servers, 0, account.freeServers, account.lastSignin, account.token, account.salt, account.password, account.resetAttempts);

    res.status(200).send({ success: true });
  } else {
    res.status(400).send({ success: false, reason: "Invalid token" });
  }
});

Router.post("/email/resetPassword/", async (req, res) => {
  res.header("Access-Control-Allow-Origin", "*");

  let password = req.body.password;
  let email = req.query.email;
  if (!email) {
    return res.status(400).send({ success: false, reason: "Invalid email" });
  }
  if (email.includes("email:")) email = email.replace("email:", "");
  let confirmPassword = req.body.confPassword;
  let created2 = req.query.created;
  const emailPath = pathTraversal.accountFilePath("email", email);
  if (emailPath === null) {
    return res.status(400).send({ success: false, reason: "Invalid email" });
  }
  let account = readJSON(emailPath);

  try {
    const created = await s.getCustomerCreationDate(email);
    if (account.resetAttempts < 5) {
      let sameDay = false;
      //created and created2 are in unix time. If the calendar day is the same, true
      if (new Date(created * 1000).toDateString() === new Date(created2 * 1000).toDateString()) {
        sameDay = true;
      }
      console.log("sameDay " + sameDay)
      if (sameDay || mode === "solo") {
        if (password == confirmPassword) {
          if (password.length >= 7) {
            [salt, password] = files.hash(password).split(":");

            account.password = password;
            account.token = uuidv4();
            account.salt = salt;

            res.status(200).send({ success: true });
          } else {
            res
              .status(400)
              .send({ token: -1, reason: "Password is too short" });
          }
        } else {
          res.status(400).send({ token: -1, reason: "Passwords do not match" });
        }
      } else {
        account.resetAttempts++;
        res.status(400).send({
          success: false,
          reason: "Wrong creation date",
          attempts: account.resetAttempts,
        });
      }
    } else {
      res.status(400).send({ success: false, reason: "Too many attempts" });
    }
  } catch (err) {
    console.log(err);
    res.status(500).send({ success: false, reason: "An error occurred" });
  }
  writeJSON(emailPath, account);
  writeAccount(account.accountId,  "email:"+email, email, account.servers, 0, account.freeServers, account.lastSignin, account.token, account.salt, account.password, account.resetAttempts);
});

//combined signin and signup for discord
Router.post("/discord/", async (req, res) => {
  res.header("Access-Control-Allow-Origin", "*");

  let account = {};
  let nameTaken = false;
  let token = req.query.token;

  // Fetch the Discord user. Token is passed as a header value (never shell-
  // interpolated) and the request is bounded by a timeout so it can't hang.
  let res2;
  try {
    const discordRes = await fetch("https://discord.com/api/users/@me", {
      method: "GET",
      headers: { authorization: "Bearer " + token },
      signal: AbortSignal.timeout(10000),
    });
    if (!discordRes.ok) {
      return res
        .status(401)
        .send({ token: -1, reason: "Discord authentication failed" });
    }
    res2 = await discordRes.json();
  } catch (err) {
    console.error("discord auth error:", err);
    return res
      .status(502)
      .send({ token: -1, reason: "Could not reach Discord" });
  }

  let username = res2 && res2.username;
  if (!username) {
    return res
      .status(401)
      .send({ token: -1, reason: "Discord authentication failed" });
  }

  // Discord itself doesn't allow "/" in usernames, but the account path is
  // still built by concatenation below - validating here means that
  // guarantee doesn't have to be trusted for path safety.
  const discordPath = pathTraversal.accountFilePath("discord", username);
  const discordPathLower = pathTraversal.accountFilePath("discord", username.toLowerCase());
  if (discordPath === null || discordPathLower === null) {
    return res
      .status(401)
      .send({ token: -1, reason: "Discord authentication failed" });
  }

  try {
    if (fs.existsSync(discordPath)) {
      nameTaken = true;
    }
    //if account exists, so the user is signing in not up...
    if (nameTaken) {
      let account = readJSON(discordPath);
      let response = {};
      account.ips = [];
      if (account.ips.indexOf(files.getIPID(req.ip)) == -1) {
        account.ips.push(files.getIPID(req.ip));
      }
      response = {
        email: account.email,
        token: account.token,
        accountId: account.accountId,
        username: username,
        firstTime: false,
        avatar: `https://cdn.discordapp.com/avatars/${res2.id}/${res2.avatar}.webp`,
        bannerColor: res2.banner_color,
      };
      account.lastSignin = new Date().getTime();
      writeJSON(discordPath, account);
      writeAccount(account.accountId, "discord:"+username, account.email, account.servers, 0, account.freeServers, account.lastSignin, account.token, account.salt, account.password, account.resetAttempts);
      res.status(200).send(response);
    } else {
      let email = res2.email;
      if (!email) {
        return res
          .status(400)
          .send({ token: -1, reason: "Discord account has no email" });
      }
      email = email.toLowerCase();
      if (email.includes("email:")) email = email.replace("email:", "");

      const conflict = findConflictingAccount(email, "discord:" + username.toLowerCase());
      if (conflict) {
        return res.status(400).send(conflict);
      }

      let accountId = "acc_"+Buffer.from(nodeName + (nodeName.includes("*email:") ? "" : "*discord:") + username.substring(0, 7)).toString('base64url');

      account.accountId = accountId;
      account.token = uuidv4();
      account.resetAttempts = 0;

      account.ips = [];
      if (account.ips.indexOf(files.getIPID(req.ip)) == -1) {
        account.ips.push(files.getIPID(req.ip));
      }

      account.type = "discord";
      account.email = email;
      account.servers = [];
      account.freeServers = 0;
      account.lastSignin = new Date().getTime();
      writeJSON(discordPathLower, account);
      writeAccount(account.accountId, "discord:"+username.toLowerCase(), account.email, account.servers, 0, account.freeServers, account.lastSignin, account.token, account.salt, account.password, account.resetAttempts);
      console.log("discord:", res2);
      res.status(200).send({
        token: account.token,
        accountId: accountId,
        username: username.toLowerCase(),
        firstTime: true,
        avatar: `https://cdn.discordapp.com/avatars/${res2.id}/${res2.avatar}.webp`,
        bannerColor: res2.banner_color,
        email: res2.email,
      });
    }
  } catch (err) {
    console.error("discord route error:", err);
    if (!res.headersSent) {
      res.status(500).send({ token: -1, reason: "Internal error" });
    }
  }
});

Router.delete("/discord", (req, res) => {
  let username = req.headers.username;
  let token = req.headers.token;
  const discordPath = pathTraversal.accountFilePath("discord", username);
  if (discordPath === null) {
    return res.status(400).send({ success: false, reason: "Invalid token" });
  }
  let account = readJSON(discordPath);

  if (validToken(token, account)) {
    for (let i in account.servers) {
      files.removeDirectoryRecursiveAsync("servers/" + account.servers[i]);
    }

    fs.unlinkSync(discordPath);

    res.status(200).send({ success: true });
  } else {
    res.status(400).send({ success: false, reason: "Invalid token" });
  }
});

// Combined signin and signup for Google
Router.post("/google/", (req, res) => {
  res.header("Access-Control-Allow-Origin", "*");

  let account = {};
  let emailTaken = false;
  let code = req.query.code;
  let redirectUri = req.query.redirectUri;

  if (!code || !redirectUri) {
    return res.status(400).send({ token: -1, reason: "Missing code or redirectUri" });
  }

  // Check if Google OAuth is configured
  if (!config.googleOAuthId || !config.googleOAuthSecret) {
    console.error("Google OAuth not configured. googleOAuthId:", config.googleOAuthId, "googleOAuthSecret:", config.googleOAuthSecret ? "***" : "undefined");
    return res.status(500).send({ token: -1, reason: "Google OAuth not configured in config.txt. Please add googleOAuthId and googleOAuthSecret." });
  }

  console.log("Google OAuth: Using client_id:", config.googleOAuthId);

  // Step 1: Exchange authorization code for access token
  //
  // code/redirectUri are attacker-controlled (req.query) and used to be
  // interpolated into a single-quoted exec() curl string via
  // tokenParams.toString() - URLSearchParams happens to percent-encode
  // quotes, so that particular string was never actually exploitable, but
  // it relied on that encoding being the only thing standing between here
  // and a shell. security.curl runs curl via execFile (no shell) so this
  // isn't a shell-quoting problem anymore regardless of encoding.
  const tokenParams = new URLSearchParams({
    code: code,
    client_id: config.googleOAuthId,
    client_secret: config.googleOAuthSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code'
  });

  security
    .curl([
      "-s",
      "-X",
      "POST",
      "https://oauth2.googleapis.com/token",
      "-H",
      "Content-Type: application/x-www-form-urlencoded",
      "-d",
      tokenParams.toString(),
    ])
    .catch((err1) => {
      console.error("Error exchanging code for token:", err1);
      res.status(500).send({ token: -1, reason: "Failed to exchange authorization code" });
      return null;
    })
    .then((result) => {
      if (result === null || res.headersSent) return;
      const tokenResponse = result.stdout;

      let tokenData;
      try {
        tokenData = JSON.parse(tokenResponse);
      } catch (parseErr) {
        console.error("Error parsing token response:", tokenResponse);
        return res.status(500).send({ token: -1, reason: "Invalid token response" });
      }

      if (tokenData.error) {
        console.error("Google OAuth error:", tokenData.error_description);
        return res.status(400).send({ token: -1, reason: tokenData.error_description || "OAuth error" });
      }

      const accessToken = tokenData.access_token;

      // Step 2: Fetch user profile using access token
      security
        .curl(["-s", "-X", "GET", "https://www.googleapis.com/oauth2/v2/userinfo", "-H", `Authorization: Bearer ${accessToken}`])
        .catch((err2) => {
          console.error("Error fetching user info:", err2);
          res.status(500).send({ token: -1, reason: "Failed to fetch user info" });
          return null;
        })
        .then((result2) => {
          if (result2 === null || res.headersSent) return;
          const userResponse = result2.stdout;

          let userData;
          try {
            userData = JSON.parse(userResponse);
          } catch (parseErr) {
            console.error("Error parsing user response:", userResponse);
            return res.status(500).send({ token: -1, reason: "Invalid user response" });
          }

          if (userData.error) {
            console.error("Google user info error:", userData.error.message);
            return res.status(400).send({ token: -1, reason: userData.error.message || "Failed to fetch user info" });
          }

          console.log("Google user data:", userData);

          let email = userData.email.toLowerCase();
          if (email.includes("email:")) email = email.replace("email:", "");

          const googlePath = pathTraversal.accountFilePath("google", email);
          if (googlePath === null) {
            return res.status(400).send({ token: -1, reason: "Invalid email" });
          }

          // Check if account exists (sign-in)
          if (fs.existsSync(googlePath)) {
            emailTaken = true;
          }

          if (emailTaken) {
            // Sign-in: Load existing account
            let account = readJSON(googlePath);
            let response = {};

            if (account.ips.indexOf(files.getIPID(req.ip)) == -1) {
              account.ips.push(files.getIPID(req.ip));
            }

            response = {
              email: account.email,
              token: account.token,
              accountId: account.accountId,
              username: email,
              firstTime: false,
              picture: userData.picture,
              name: userData.name,
            };

            account.lastSignin = new Date().getTime();
            writeJSON(googlePath, account);
            writeAccount(
              account.accountId,
              "google:" + email,
              account.email,
              account.servers,
              0,
              account.freeServers,
              account.lastSignin,
              account.token,
              account.salt,
              account.password,
              account.resetAttempts
            );

            res.status(200).send(response);
          } else {
            // Sign-up: Create new account
            const conflict = findConflictingAccount(email, "google:" + email);
            if (conflict) {
              return res.status(400).send(conflict);
            }

            let accountId = "acc_" + Buffer.from(
              nodeName + (nodeName.includes("*email:") ? "" : "*google:") + email.substring(0, 7)
            ).toString('base64url');

            account.accountId = accountId;
            account.token = uuidv4();
            account.resetAttempts = 0;
            account.ips = [];
            if (account.ips.indexOf(files.getIPID(req.ip)) == -1) {
              account.ips.push(files.getIPID(req.ip));
            }

            account.type = "google";
            account.email = email;
            account.servers = [];
            account.freeServers = 0;
            account.lastSignin = new Date().getTime();

            writeJSON(googlePath, account);
            writeAccount(
              account.accountId,
              "google:" + email,
              account.email,
              account.servers,
              0,
              account.freeServers,
              account.lastSignin,
              account.token,
              "",
              "",
              account.resetAttempts
            );

            console.log("Google account created:", userData);
            res.status(200).send({
              token: account.token,
              accountId: accountId,
              username: email,
              firstTime: true,
              picture: userData.picture,
              name: userData.name,
              email: email,
            });
          }
        });
      });
});

// Delete Google account
Router.delete("/google", (req, res) => {
  let email = req.headers.username;
  if (email.includes("google:")) email = email.replace("google:", "");
  let token = req.headers.token;

  try {
    const googlePath = pathTraversal.accountFilePath("google", email);
    if (googlePath === null) {
      return res.status(400).send({ success: false, reason: "Invalid token" });
    }
    let account = readJSON(googlePath);

    if (validToken(token, account)) {
      // Delete all user's servers
      for (let i in account.servers) {
        files.removeDirectoryRecursiveAsync("servers/" + account.servers[i]);
      }

      // Delete account file
      fs.unlinkSync(googlePath);

      res.status(200).send({ success: true });
    } else {
      res.status(400).send({ success: false, reason: "Invalid token" });
    }
  } catch (error) {
    console.error("Error deleting Google account:", error);
    res.status(500).send({ success: false, reason: "An error occurred" });
  }
});

Router.post("/email", (req, res) => {
  let email = req.query.email;
  let accountname = req.headers.accountname;
  let token = req.headers.token;

  // accountname names the whole account file directly - accountFilePathFromKey
  // confines it to accounts/ instead of trusting it as-is, which otherwise
  // lets ".." in the header reach (and overwrite) any JSON file on the host
  // the process can access, not just other accounts.
  const accountPath = pathTraversal.accountFilePathFromKey(accountname);
  if (accountPath === null) {
    return res.status(400).send({ success: false, reason: "Invalid token" });
  }
  let account = readJSON(accountPath);

  if (validToken(token, account)) {
    account.email = email;
    writeJSON(accountPath, account);
    writeAccount(account.accountId, accountname, email, account.servers, 0, account.freeServers, account.lastSignin, account.token, account.salt, account.password, account.resetAttempts);
    res.status(200).send({ success: true });
  }
});

module.exports = Router;
