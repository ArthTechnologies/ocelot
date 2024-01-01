Arth Panel Beta 1.2 
An account system, new plugin options, and much more arrives in the Beta 1.2 update. 
2023-04-02
DiamonC 
https://floss.social/@DiamonC 
https://cdn.masto.host/floss/accounts/avatars/109/207/881/612/624/574/original/6516bdc6b0ff0203.jpeg

---

![image-bordered](https://i.imgur.com/WQy6vdr.png)

Arth Panel's beta 1.2 update is here with a new account system, many bug fixes, and more. If you're not familiar with Arth Panel, consider checking out our [Introducing Arth Panel](https://arthmc.xyz/blog/introducing-arth-panel) article.

## Ditching Pocketbase

Originally, Arth Panel relied on an application called Pocketbase to manage accounts. The main reason we're removing this is that having a third application (Quartz and Observer being the first two) made with a different language, different developers, its own web panel and database adds a lot of complexity to Arth Panel.  
	Besides security, it makes the panel less accessible to your average user. Arth Panel was created to be as accessible as possible because the alternatives were difficult for beginners to setup. Our goal is that anyone who knows how to run a Linux command and change directories should be able to run Arth Panel.

## The New Account System
The new account system stores accounts in the accounts.json file. All you need is an email and password to signup/login. Like most websites, passwords are stored as hashes (strings that can't be traced back to your password) so that if someone hacked into your server computers, they wouldn't be able to access your user's passwords. Salts (random values added into the hash) are also employed so that hackers can't scan for common passwords like "password123".

You can reset your password and delete your account via the account management page. If you've forgotten your password, you will need to enter the last 4 digits of your credit card and your new password. For security reasons, you only have 5 attempts. 

## Payment Changes
Besides checking stripe for whether you're subscribed or not, Arth Panel also checks how many subscriptions you have. Users now need to pay for each server.

If you don't want to monetize your panel, you can go into stores/settings.json and set `enablePay` to false. You can also add an exception for individual users by adding `bypassStripe:true` to an account in accounts.json. Disabling authentication is still experimental for now.

## User Experience

The goal of this panel is to be easy to use for everyone, including beginner Minecraft players. The how to join servers button now links to our own guide on how to join Minecraft servers from Java Edition, mobile, and even on consoles where custom servers aren't supported by default. We also added a "help" button in the bottom right corner with a link to a new discord we set up to offer support with any problems users might be experiencing.

One major issue with the previous version was the experience on mobile. While most pages looked fine, the /newserver page was way too small and the server page was all over the place, with buttons outside of their containers and containers not being centered. I've gone through each page on mobile simulation mode and fixed these issues.

Some minor changes include:  
-  adding a menu to confirm that you want to delete a server
-  adding a button to download the world file before deleting a server  
-  adding metadata such as the number of downloads on plugin search results  
-  replacing most of the annoying alerts that prevent you from clicking anything with alerts that pop up at the top right for a few seconds  

## The Future
Accessibility is a major priority, so we'll be adding documentation to explain everything a beginner needs to know to setup the panel.

Our main focus now is adding support for modded servers, such as forge and quilt, as well as support for modpacks. The majority of this update's development time was actually spent on modded servers, however there are many challenges when it comes to implementing them and we have to delay this to a future update.

While this update has a large number of breaking changes, given we had to replace our whole account system among other things, we hope to start putting the pieces in place for a stable release soon. The main things to work on are making it easy to upgrade servers to new versions and making the API routes more consistent.

 Keep an eye on our Mastodon and our blog for new updates, and as always, consider checking out/contributing to Arth Panel at [codeberg](https://codeberg.org/arth/).