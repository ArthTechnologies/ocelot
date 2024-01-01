Arth Panel Beta 1.4  
CurseForge support, easy setup, security upgrades, discord accounts, and more is here in the beta 1.4 update.  
2024-01-01
DiamonC 
https://floss.social/@DiamonC 
https://cdn.masto.host/floss/accounts/avatars/109/207/881/612/624/574/original/6516bdc6b0ff0203.jpeg

---

![image-bordered](https://i.imgur.com/FmznZoo.png)

It's been exacely one year since [Arth Panel]((https://arthmc.xyz/blog/introducing-arth-panel)) entered beta, and prograss has not slowed down one bit, with CurseForge support, UI improvements, many new security features, and much more.

## Security

Security has improved alot, with many new features, starting with cloudflare turnstile, which verifies if users are human without making them do captchas. Additionally, we added backups every 12 hours and virus searches for uploaded files using `clamdscan`.

### CurseForge

CurseForge support is finally here, allowing you access to tens of thousands of mods and modpacks, like RLCraft.

## An easier setup experience

It was previously not very convenient to connect your observer (frontend) instance with quartz (backend), but now its very easy because you can now set this, and many other settings on observer using enviroment variables. On quartz, you used to have to edit three different files to configure everything, but now there is one unified `config.txt` file, with added descriptions of each setting.

### Discord Accounts

You can now create accounts with Discord instead of email, which is alot more convenient if you have Discord.

## UI Improvements

Arth Panel was created to improve the Minecraft server experience compared to the alternatives, and this includes how it looks. A priority we had in this update was to improve the design, and we've done this by adding a frosted glass effect on modals, updating to DaisyUI (a library we use that helps with visual elements) 4 which comes with various design improvements, and a new light theme. The light theme has never been very pretty, but we fixed this thanks to DaisyUI's nord theme which the new light theme is based on. We also fixed all bugs that happened when light mode was on, especially bugs with gradients.

## Checkout 

Instead of relying on stripe payment links, which dont let you select different plans, Arth Panel now has its own checkout page, still using stripe of course. It lets you choose between modded and basic plans, which can be at different prices, although we have not yet made it so that you are unable to create modded servers on basic plans.

## And more!

Theres also numerous small changes that together make a big difference. Heres a list:

- Fixed being able to click non-interactive buttons like "starting".
- Fixed youtube embeds in mod descriptions being not sized properly
- Updated to DaisyUI 4 from DaisyUI 2
- Added option to disable/enable mods
- Added ability to change the version of a mod/plugin or modpack
- Added download count to plugins, made plugin and mod and modpack search results look the same
- Made worldgen mods in /newserver slightly bigger, they get bigger on hover and a tooltip shows the name
- Added 'load more' feature to mod/plugin/modpack search
- Fixed various bugs with unsupported locales/langs
- Fixed forgot password button not being clickable
- Added 'sortBy' to searches
- Switched to java 8 from java 11 for old versions because of various issues
- Fixed some modals not covering all of the screen (for example, there might be a slim bar on the left of the screen where the background content is not dimmed)
- Fixed various icons shrinking whenever space in their containers was limited
- Added distinctions between 'requires' and 'works with' dependencies
- added "go to description" button on mobile because versions are on top and it may take a lot of scrolling to get to it.
- Fixed various visual bugs with search results and skeleton loaders
- Docker is now reccomended for the frontent because it supports enviroment variables
- The button for the page you're on in the navbar is now highlighted to help users associate the button with the page
- Added ability to view changelogs for a version of a mod/modpack/plugin
- Added optional virus scanning for world uploads using `clamdscan`.
- Fixed being able to scroll on modals below your current one, causing visual bugs
- Fixed fullscreen terminal button following the terminal output instaead of staying on the top right corner
- Alerts can now be info or warning, not just errors, also they last for a bit longer now
- Control + S now saves changes in the file editor
- Added descriptors for the different server softwares
- Added language switcher button on the bottom left
- Added alphabetical sorting when weaving mods/plugins
- Added support for profile avatars for discord accounts
- Fixed errors with deleting accounts and servers
- Fixed errors with downloading worlds when a modpack uses a 'World' folder instead of 'world'.
- Added DeepL translate button for mod/plugin/modpack descriptions.
- Added backups feature to back up your quartz instance every 12 hours.

## The future

The next update will likely be a bit less exciting than this one or the one before, as our main focus is to improve the stability of everything and fix bugs. We also need to clean up the code to make it more efficient and easier to read, and simplify some of the API routes. Support for ocelot, a software that connects multiple quartz instances together, is also a major priority. 

If you are interested in using Arth Panel or interested in helping us out with translations or finding bugs or coding, go to our [codeberg](https://codeberg.org/arth/) page.