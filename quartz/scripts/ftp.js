var fs = require('fs');
var path = require('path');
const { readJSON } = require('./utils');
const config = require('./utils').getConfig();
const security = require('./security');
const { exec } = require('child_process');
const dockerMode = JSON.parse(config.dockerMode);

// Rebuilt from scratch on every startFtpServer() call. Stale entries here used
// to accumulate forever, which kept dead bind mounts (and former owners' logins)
// alive across container rebuilds.
let users = [];

let port = 10000 + parseInt(config.idOffset) + 99;

// docker rm/run must not interleave with a rebuild already in flight (two
// server creations seconds apart used to race the old stop/rm/run timers).
let restartInProgress = false;
let restartQueued = false;

function startFtpServer() {
    if (!dockerMode) return;
    if (restartInProgress) {
        restartQueued = true;
        return;
    }

    // mc.js mounts server folders into MC containers from cwd, so the same
    // path is the correct host path for the sftp container's mounts.
    const serversRoot = path.join(process.cwd(), 'servers');

    users = [];
    const accountsFolder = fs.readdirSync('./accounts');
    for (const accountFile of accountsFolder) {
        if (!accountFile.endsWith('.json')) continue;
        const data = readJSON(`./accounts/${accountFile}`);
        if (data == undefined || !Array.isArray(data.servers) || data.servers.length === 0) continue;
        if (data.accountId == undefined) continue;
        const accountId = data.accountId.replace('acc_', '');
        for (const server of data.servers) {
            // Skips "{id}:freed" entries and anything whose folder is gone —
            // mounting a missing host path makes Docker create it as an empty
            // dir, which is exactly the "empty server folder" FTP bug.
            if (!fs.existsSync(path.join(serversRoot, String(server), 'server.json'))) continue;
            security.ensureKey(server);
            users.push(`${accountId.slice(-6)}.${server}:${security.getFileAccessKey(server)}:${serversRoot}/${server}/:${server}`);
        }
    }

    const mountArray = [];
    const usersArray = [];
    const seenUsernames = new Set();
    for (const entry of users) {
        const [username, token, directory] = entry.split(':');
        if (seenUsernames.has(username)) continue;
        seenUsernames.add(username);
        mountArray.push(`-v "${directory}:/home/${username}/server" `);
        usersArray.push(`"${username}:${token}:1000:1000:::server" `);
    }

    restartInProgress = true;
    // rm -f both stops and removes; it only errors when the container doesn't
    // exist, which just means the name is already free.
    exec('docker rm -f sftp_server', () => {
        exec(`docker run -d --name sftp_server -p ${port}:22 -v sftp_ssh:/etc/ssh ${mountArray.join(" ")}atmoz/sftp ${usersArray.join(" ")}`, (error) => {
            if (error) {
                console.error(`Error starting FTP server: ${error}`);
            } else {
                console.log(`FTP server started on port ${port} with ${usersArray.length} users`);
            }
            restartInProgress = false;
            if (restartQueued) {
                restartQueued = false;
                startFtpServer();
            }
        });
    });
}

function getTempToken(username) {
    // Exact match on the username field — startsWith let "abc123.5" resolve to
    // "abc123.55"'s credentials.
    const entry = users.find(user => user.split(':')[0] === username);
    return entry ? entry.split(':')[1] : undefined;
}

module.exports = {
  startFtpServer,
    getTempToken
};
