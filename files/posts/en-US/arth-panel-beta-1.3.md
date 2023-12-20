Arth Panel Beta 1.3 
7 months of improvements culminate in the Beta 1.3 update. 
2023-11-02
DiamonC 
https://floss.social/@DiamonC 
https://cdn.masto.host/floss/accounts/avatars/109/207/881/612/624/574/original/6516bdc6b0ff0203.jpeg

---

![image-bordered](https://i.imgur.com/7PD9CMz.png)

After 7 months, Arth Panel's beta 1.3 update is finally here with a significantly more stable experience, support for proxies, modded servers, updating servers, a file explorer, and so much more. If you're not familiar with Arth Panel, consider checking out our [Introducing Arth Panel](https://arthmc.xyz/blog/introducing-arth-panel) article.

## Modded Servers

While most of the work was done in the last update, the feature wasn't quite ready. Now, you can run a modded server with quilt, forge, or fabric, and you can create it with a modpack, and/or add mods manually. While the catalogue of mods is quite large on modrinth, Arth Panel doesn't support CurseForge mods yet, as they are much less open with their APIs and it will likely require some setup on the panel owner's part.

## Proxies

Proxies are a special type of server that connect multiple servers, making them appear as one. Most servers use this in order to have a minigames section, survival section, etc in one server. Arth Panel now supports these, with some convenience features not seen on most other panels. It'll automatically set up any sub-server you add with the proxy if it is on the same panel, and since proxies load so quickly, it'll automatically restart it if you add a sub-server to apply the change.

## Server Updates

You can finally update your servers, which was the last basic feature missing. You can also change your server to any available version. Arth Panel will tell you when your worldgen mods wont work with a certain version, so you can delete them or not update accordingly.

## Jars System

When testing out the update feature, we found that for some reason, you couldn't update to 1.20 or above on paper servers. The cause turned out to be serverjars.com, which hasn't uploaded a 1.20+ jar for paper **to this day**. So, we created a software called jarsmc that arth panel uses as backup whenever a jar isn't on serverjars.com. By default Arth Panel is already setup with our instance of jarsmc, but you could instead run your own if you want to have a different catalog of jars, or faster speeds.

## The World Menu

While you could previously download your world, you can now upload a world, or regenerate a world. You can choose what worldgen mods it'll have, its world type, and its seed.

## File explorer

You can now edit certain text files from the panel, allowing you to configure most plugins. For security, you can't edit files like server.properties, or delete/edit executable files.

## The Future
CurseForge is by far the largest platform for Minecraft mods, and it will be supported in the next update. While Modrinth is often faster, and is better for client-side mods (mods that only change things on your end, so you can still play on non-modded servers), there are many big mods and Modpacks that just aren't on Modrinth. Along with CurseForge support, File History should also come to the next update, allowing you to edit files without worrying.

We've been working on ocelot, a master backend that connects instances of quartz, the backend of Arth Panel. This allows for you to add capacity for more servers by adding more quartz instances on different computers. While it wasn't quite ready for this update, it should be supported soon.

Accessibility is a major priority, and right now, to setup the panel you need to go into the stores folder, and edit values in various files. We want to put every setting you need into one unified file. On the frontend, you also have to dig through some folders in order to connect it to your own instance of quartz.

To get out of beta, we need to do a variety of things. Firstly, we need to add more layers of security. While Arth Panel has security for accounts and servers, anyone who knows anything about cybersecurity knows that nothing is 100% safe. Therefore, we need to add additional layers of security, as well as backups to make sure no-one's data is lost (unless they want to delete it, of course). On the technical side of things, we need to re-organize, and re-name some API routes so they make the most sense, because after we get out of beta, changes like that require making a whole new version of the API. There's also many areas in the code that could be cleaned up, shortened, and have more comments.

Keep an eye on our Mastodon and our blog for new updates, and as always, consider checking out/contributing to Arth Panel at [codeberg](https://codeberg.org/arth/).