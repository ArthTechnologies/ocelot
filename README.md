# <img width="30" height="30" alt="New Piskel-1 png(1)" src="https://github.com/user-attachments/assets/c053381c-3c39-439a-95e0-fed56d37cb10" /> Ocelot
Ocelot is only supported on linux.

Self-hosting Minecraft servers can be very useful, but most panels out there are often difficult and can seem like a black box.
Ocelot was built from the ground up, with simplicity, design, and performance in mind. We're nearing our 1.0 release, and have these features already implemented:
- Docker containerization
- Account system with email/password and discord options
- Subdomain support via Cloudflare
- Scheduler system to schedule restarts, commands, or backups.
- SFTP Support (Beta)

 ### **For non-developers:**
 We don't currently have a stable version of ocelot released yet. Check back soon

 ### **For developers:**
 Ocelot is split into 2 components:
 - `quartz`, the backend built with node.js and express
 - `observer` the frontend built with svelte, tailwindui and daisyui

To setup quartz, follow these steps:
1. run `npm i`
2. run `node run`
3. quartz will ask you a few questions for basic configuration. It's reccomended after this you take a look at `config.txt` manually.
4. run `node run` whenever you want to start quartz. Alternatively, you could use `sudo sh start.sh` to ensure SFTP works properly. This uses the `screen` command
