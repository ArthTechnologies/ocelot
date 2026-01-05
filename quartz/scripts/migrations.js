const fs = require("fs");
const { readJSON, writeJSON } = require("./utils.js");
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
            stringServerList: false
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

module.exports = {
    accountsToTSV,
    serversToTSV,
    migration1,
    getMigrationsStatus,
    markMigrationComplete,
    stringServerList
};