[![Get at Docker Hub](https://img.shields.io/badge/Docker-2CA5E0?style=for-the-badge&logo=docker&logoColor=white)](https://hub.docker.com/r/arthmc/quartz)

### Warnings:

- Arth Panel is in beta and should not be used in production yet.
- There are several issues with the docker image currently, and we recommend running quartz directly for now.

Documentation can be found [here](https://codeberg.org/arth/quartz/wiki)

# Quartz

Quartz is a backend for Arth Panel, a lightweight self-hosted Minecraft server panel. Quartz is made with Node and Express. For testing purposes, there is an instance of quartz you can use at https://api.arthmc.xyz/

## How to run with docker

1. Download the image from docker hub with the command `sudo docker pull arthmc/quartz:latest`
2. Run the image with `sudo docker run -p 4000:4000 -e STRIPE-KEY=yourstripekey arthmc/quartz:latest`. To change the port, replace the first 4000 with the port number you want.
3. **Pocketbase will also need to be installed.** While there is no official docker image, installing it locally is very easy. Just download their executable file, and run `./pocketbase serve --http "0.0.0.0:[port]"`.

## How to run without docker
1. Grab the source code with `git clone https://codeberg.org/arth/quartz`
2. Install the packages with `npm i`
3. Run with `node run`

# Dependencies
- Arth Uses the `curl` command to download plugins and the `convert` command to downscale images. If you want these functionalities, you'll need to install those commands.

# Contributing

To run a dev server, follow the instructions in "how to run without docker"

## Contributing Guidelines

- Please format your code with Prettier VSCode extension or an alternative that achieves the same results.

### Check out our [frontend](https://github.com/arthmc/observer)'s progress

## Why Arth Panel?

The main difference between an alternative like pufferpanel or pterodactyl is that it's meant to work in a way so that if an issue were to occur, you could easily just SSH into the machine and run the jar directly in a folder, so you know that your server's uptime is not dependant on a panel someone else made working flawlessly.

## Routes

```
POST /terminal
GET /terminal
GET /panel-key
GET /server
DELETE /server
POST /server
POST /server/new
GET /servers
GET /settings
POST /settings
```

# To-do list

✅ Basic file data storage that stores details about servers.  
✅ Basic API that provides details about servers to frontend.  
✅ Ability to run Minecraft servers with specified versions and softwares  
✅ Basic communication with frontend for terminal  
✅ Consistent routes  
❌ Locking a customer's assets behing a password/valid pocketbase token  
❓ Protecting a customer's assets with end-to-end encryption  
  