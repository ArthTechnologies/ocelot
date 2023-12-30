Arth Panel Actualización Beta 1.3 
¡7 meses de mejores llegan en la actualización Beta 1.3!
2023-11-02
DiamonC 
https://floss.social/@DiamonC 
https://cdn.masto.host/floss/accounts/avatars/109/207/881/612/624/574/original/6516bdc6b0ff0203.jpeg

---

![image-bordered](https://i.imgur.com/7PD9CMz.png)

¡Después de 7 meses, la actualización beta 1.3 de Arth Panel está finalmente aquí con una experiencia más estable, compatibilidad con proxies, servidores con mods, actualizar servidores, una explorador de archivos, y mucho más! Si no estás familiarizado con Arth Panel, considere consultar nuestro artículo [Presentando Arth Panel](https://arthmc.xyz/blog/es-ES*presentando-arth-panel].

## Servidores con mods

Aunque la mayoría de el trabajo era hecho en la actualización previa, la característica no fue lista. Ahora puedes ejecutar un servidor con quilt, forge o fabric, y puedes crearlo con un modpack y o añadir mods tú mismo. Anque hay muchos mods en Modrinth, Arth Panel no supporte mods de CurseForge ya porque ellos no son abiertos con su API y problamente require algún configuración de tu parte.

## Proxies

Proxies son un tipo de servidor especial que connectan servidores multiplés, hacer ellos verse como uno. La mayoría de los servidores usan ese para tener secciónes como minigames, supervivencia y más en un servidor singular. Arth Panel ahora supporte con algún characterísticas de conveniencia no son visto en la mayoría de los otros panels. Va a aútomaticamente configura alguno sub-server que añades al proxy, y porqué proxies ejecutar tan rapidíamente va a aútomaticamente reiniciar cuando añades un sub-server. 

## Server Updates

¡Finalmente puedes actualizar tus servidores, lo cual estaba la última characterística principal ausente! También puedes cambiar tu servidor a todas las versiones. Arth Panel notificara cuando tus worldgen mods no pueden funcionar con una versión cierta.

## El sistema de Jars

Cuando probando la characterística actualizar, notamos que por alguna razón no puedías actualizar para 1.20 o superior en servidores con paper. La causa fue serverjars.com, que no ha subía un jar 1.20 o superior **a este diá**. Así que creábamos un software llamado JarsMC que Arth Panel usa de respaldo cuando un jar no está en serverjars.com. Por defecto Arth Panel es configurada con nuestra instancia de jarsmc pero podías ejecutar tu instancia propia si quieres tener un catálogo de jars diferente, o velocidades más rápido.

## El Menú Mundo

Anque podrías ya descargar tu mundo, ahora puedes subir un mondo o regenerarlo. Puedes elegir qué worldgen mods, tipo de mundo y semilla tendrá. 

## Explorador de Archivos

Ahora puedes editar ciertos archivos textos en el panel, pudiendo configurar la mayoría de plugins. Por seguridad, no puedes editar archivos como server.properties o elimiar/editar archivos ejecutables. 

## The Future
CurseForge es por mucho la platforma más popular para mods de Minecraft y va a ser compatible con la próxima actualización. Aunque usualmente Modrinth está más rápido y mejor para mods de cliente(Mods que solo cambian cosas en tu parte así que puedes jugar en servidores sin mods), hay muchos mods grandes que no son en Modrinth. Junto con suporte para CurseForge, historia de archivos debe ser añadido a la próxima actualización, poder editar archivos sin preocuparte.

Hemos sido trabajando en ocelot, un "backend principal" que conecta instancias de Quartz (El software de API de Arth Panel). Este te permite añadir más capacidad para más servidores añadiendo más instancias de quartz en computadoras diferentes. Aunque no fue listo, debe ser compatible pronto.

Accesibilidad está una prioridad mayor, y actualmente para instalar el panel necesitas editar archivos múltiples en la carpeta "stores". Queremos hacer un archivo unificado para todos los ajustes que necesitas. En la interfaz, también necesitas buscar muchas carpetas para conectarlo a tu instancia de Quartz.

Para salir beta, necesitamos hacer muchas cosas. Primero, necesitamos añadir más capas de seguridad. Aunque Arth Panel tiene seguridad para cuentas y servidores, cualquiera que sabe cualquier cosa sobre seguridad sabe que nada está 100% seguro. Por lo tanto necesitamos añadir capas de seguridad adicionales y copias de seguridad para asegurar los datos de nadie está perdido (A menos que quieren para eliminarlo, claro). En la parte técnico de cosas, necesitamos reorganizar y renombrar algunos de las rutas de API porqué después de salir beta, cambios como ellos requiera hacer una versión de API nueva. Hay también muchas áreas en el código que podría ser limpiarse, acortarse, y tener más comentarios.

Mantienes atento a nuestro Mastodon y blog para actualizaciones nuevas y como siempre, consideras consultar o colaborar con nosotros en [codeberg](https://codeberg.org/arth/).