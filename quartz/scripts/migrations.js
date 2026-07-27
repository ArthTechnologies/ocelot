const fs = require("fs");
const { readJSON, writeJSON } = require("./utils.js");
const accountLinking = require("./accountLinking.js");
function accountsToTSV() {
    let accounts = fs.readdirSync("accounts");
    let columns = ["id","username","billingEmail","servers","stripeServers","freeServers","lastSignin","token","salt","password","resetAttempts"];
    let tsv = columns.join("\t") + "\n";
    for (let i in accounts) {
        if (accounts[i].includes(".json")) {
        let account = readJSON(`accounts/${accounts[i]}`);
        try {
        let row = [account.accountId, accounts[i].split(".json")[0], account.email, account.servers, 0, account.freeServers, account.lastSignin, account.token, account.salt, account.password, account.resetAttempts];
        tsv += row.join("\t") + "\n";
        } catch (e) {
        console.log("error", e);
        }
        }
    }
    fs.writeFileSync("accounts.tsv", tsv);
}

function serversToTSV() {
    let servers = fs.readdirSync("servers");
    let columns = ["id","owner","stage","name","software","version","productID","allowedAccounts","specialDatapacks","specialPlugins"];
    let tsv = columns.join("\t") + "\n";
    for (let i in servers) {
        if (fs.existsSync(`servers/${servers[i]}/server.json`)) {
        let server = readJSON(`servers/${servers[i]}/server.json`);
        try {
            let specialDatapacks = server.specialDatapacks || [];   
        let specialPlugins = server.specialPlugins || [];

        let row = [server.id, server.accountId,"created",server.name, server.software, server.version, server.productID, "", specialDatapacks.join(","), specialPlugins.join(",")];	
        tsv += row.join("\t") + "\n";
        } catch (e) {
        console.log("error", e);
        }
        }
    }
    fs.writeFileSync("servers.tsv", tsv);
}

function specialPlugins() {
    let servers = fs.readdirSync("servers");
    for (let i in servers) {
        if (fs.existsSync(`servers/${servers[i]}/server.json`)) {
        let server = readJSON(`servers/${servers[i]}/server.json`);
        try {
            let specialDatapacks = [];
            if (typeof server.addons == "string") specialDatapacks = server.addons.split(",");
            else if (Array.isArray(server.addons)) specialDatapacks = server.addons;
            let specialPlugins = [];
            if (server.webmap) specialPlugins.push("dynmap");
            if (server.voicechat) specialPlugins.push("voicechat");
            if (server.chunky) specialPlugins.push("chunky");
            if (server.discordsrv) specialPlugins.push("discordsrv");

        console.log(server.id, specialDatapacks.join(","), specialPlugins.join(","));
            server.specialDatapacks = specialDatapacks;
            server.specialPlugins = specialPlugins;
            //remove addons, webmap, voicechat, chunky, discordsrv
            delete server.addons;
            delete server.webmap;
            delete server.voicechat;
            delete server.chunky;
            delete server.discordsrv;
            writeJSON(`servers/${servers[i]}/server.json`, server);
        } catch (e) {
        console.log("error", e);
        }
        }
    }
}

function migration1() {
    specialPlugins();
}

/**
 * Get or create migrations.json tracking file
 */
function getMigrationsStatus() {
    const migrationsPath = "assets/migrations.json";
    if (!fs.existsSync(migrationsPath)) {
        const defaultMigrations = {
            stringServerList: false,
            mergeDuplicateEmailAccounts: false
        };
        fs.writeFileSync(migrationsPath, JSON.stringify(defaultMigrations, null, 2));
        return defaultMigrations;
    }
    return readJSON(migrationsPath);
}

/**
 * Mark a migration as completed
 */
function markMigrationComplete(migrationName) {
    const migrationsPath = "assets/migrations.json";
    const migrations = getMigrationsStatus();
    migrations[migrationName] = true;
    writeJSON(migrationsPath, migrations);
    console.log(`[Migration] Marked ${migrationName} as complete`);
}

/**
 * Migration: Convert integer server IDs to strings in all account files
 * This fixes compatibility with code that expects server IDs to be strings
 */
function stringServerList() {
    console.log("[Migration] Starting stringServerList migration...");
    let accountsUpdated = 0;
    let totalServersConverted = 0;

    try {
        const accounts = fs.readdirSync("accounts");

        for (let accountFile of accounts) {
            if (!accountFile.endsWith(".json")) continue;

            try {
                const accountPath = `accounts/${accountFile}`;
                const account = readJSON(accountPath);

                // Check if servers array exists and needs conversion
                if (account.servers && Array.isArray(account.servers)) {
                    let hasChanges = false;
                    let accountServersConverted = 0;

                    const convertedServers = account.servers.map(server => {
                        if (typeof server !== 'string') {
                            hasChanges = true;
                            accountServersConverted++;
                            return String(server);
                        }
                        return server;
                    });

                    if (hasChanges) {
                        account.servers = convertedServers;
                        writeJSON(accountPath, account);
                        accountsUpdated++;
                        totalServersConverted += accountServersConverted;
                        console.log(`[Migration] Updated ${accountFile}: converted ${accountServersConverted} server ID(s) to strings`);
                    }
                }
            } catch (e) {
                console.error(`[Migration] Error processing ${accountFile}:`, e.message);
            }
        }

        console.log(`[Migration] stringServerList complete: ${accountsUpdated} account(s) updated, ${totalServersConverted} server ID(s) converted`);
        markMigrationComplete("stringServerList");
        return true;
    } catch (e) {
        console.error("[Migration] stringServerList failed:", e);
        return false;
    }
}

/**
 * Migration: Link accounts that share a billing email across login methods
 *
 * A user who signed up with email and later signed in with Google/Discord ends
 * up with two separate account files that each own a different slice of their
 * servers. This grants every account in such a group access to every live
 * server any of them can reach, so either login lands on the same dashboard.
 *
 * Access needs two things to line up, matching /server/:id/allowAccount:
 *   1. the server id present in the account's `servers` array, and
 *   2. the account's id listed in the server's `allowedAccounts` string
 *      (utils.hasAccess only allows non-owners via allowedAccounts).
 */
function mergeDuplicateEmailAccounts() {
    console.log("[Migration] Starting mergeDuplicateEmailAccounts migration...");
    let groupsLinked = 0;
    let accountsUpdated = 0;
    let serversShared = 0;
    let freeServersGranted = 0;

    try {
        const groups = accountLinking.groupAccountsByEmail();

        for (const [email, accounts] of groups) {
            if (accounts.length < 2) continue;

            const groupAccountIds = accounts
                .map((account) => account.data.accountId)
                .filter(Boolean);

            // A server is only shareable if it is live AND still owned by
            // someone in this group. Folder existence alone is not enough:
            // freeing a server moves it to trashbin and releases its numeric
            // id, which a different customer's server can later occupy — that
            // server must never leak back to the account that released the id.
            const shareable = new Set();
            for (const account of accounts) {
                if (!Array.isArray(account.data.servers)) continue;
                for (const entry of account.data.servers) {
                    const rawId = String(entry).split(":")[0];
                    const serverPath = `servers/${rawId}/server.json`;
                    if (!fs.existsSync(serverPath)) continue;
                    try {
                        const server = readJSON(serverPath);
                        if (server.accountId && groupAccountIds.includes(server.accountId)) {
                            shareable.add(rawId);
                        }
                    } catch (e) {
                        console.error(`[Migration] Error reading server ${rawId}:`, e.message);
                    }
                }
            }

            if (shareable.size === 0) continue;

            console.log(
                `[Migration] Linking ${accounts.length} accounts for ${email} ` +
                `(${accounts.map((a) => a.name).join(", ")}) across ${shareable.size} server(s)`
            );
            groupsLinked++;

            // 1. Give every account in the group the full server list
            for (const account of accounts) {
                if (!Array.isArray(account.data.servers)) account.data.servers = [];
                const servers = account.data.servers;
                const countBefore = servers.length;
                let changed = false;

                for (const rawId of shareable) {
                    // The account released this server earlier; it has access
                    // again now, so drop the stale marker instead of leaving
                    // both "12:freed" and "12" behind.
                    const freedIdx = servers.indexOf(`${rawId}:freed`);
                    if (freedIdx !== -1) {
                        servers.splice(freedIdx, 1);
                        changed = true;
                    }
                    if (!servers.includes(rawId)) {
                        servers.push(rawId);
                        changed = true;
                    }
                }

                // Server creation is gated on `subs + freeServers >
                // servers.length`, and linking grows servers.length without
                // adding subscriptions — every merged user would lose slots
                // they had before. Credit one free server per server gained.
                // This can leave a few users slightly ahead, which is the
                // intended trade: cheaper than the support load of under-
                // crediting people who already paid.
                const added = servers.length - countBefore;
                if (added > 0) {
                    account.data.freeServers = (parseInt(account.data.freeServers) || 0) + added;
                    freeServersGranted += added;
                    changed = true;
                }

                if (changed) {
                    writeJSON(`accounts/${account.file}`, account.data);
                    accountsUpdated++;
                }
            }

            // 2. Authorise every account in the group on each server
            for (const rawId of shareable) {
                const serverPath = `servers/${rawId}/server.json`;
                try {
                    const server = readJSON(serverPath);
                    const allowed = accountLinking.parseAllowedAccounts(server);
                    let changed = false;

                    for (const accountId of groupAccountIds) {
                        // The owner already passes hasAccess via server.accountId
                        if (accountId === server.accountId) continue;
                        if (allowed.includes(accountId)) continue;
                        allowed.push(accountId);
                        changed = true;
                    }

                    if (changed) {
                        server.allowedAccounts = allowed.join(",");
                        writeJSON(serverPath, server);
                        serversShared++;
                    }
                } catch (e) {
                    console.error(`[Migration] Error sharing server ${rawId}:`, e.message);
                }
            }
        }

        console.log(
            `[Migration] mergeDuplicateEmailAccounts complete: ${groupsLinked} email group(s) linked, ` +
            `${accountsUpdated} account(s) updated, ${serversShared} server(s) shared, ` +
            `${freeServersGranted} free server slot(s) granted`
        );
        markMigrationComplete("mergeDuplicateEmailAccounts");
        return true;
    } catch (e) {
        console.error("[Migration] mergeDuplicateEmailAccounts failed:", e);
        return false;
    }
}

module.exports = {
    accountsToTSV,
    serversToTSV,
    migration1,
    getMigrationsStatus,
    markMigrationComplete,
    stringServerList,
    mergeDuplicateEmailAccounts
};