Arth Panel Actualización Beta 1.3
¡7 meses de mejoras llegan en la actualización Beta 1.3!
2023-11-02
DiamonC
https://floss.social/@DiamonC
https://cdn.masto.host/floss/accounts/avatars/109/207/881/612/624/574/original/6516bdc6b0ff0203.jpeg


---


![image-bordered](https://i.imgur.com/7PD9CMz.png)


¡Después de 7 meses, la actualización beta 1.3 de Arth Panel está finalmente aquí con una experiencia más estable, compatibilidad con proxies, servidores con mods, actualizar servidores, un explorador de archivos, y mucho más! Si no estás familiarizado con Arth Panel, considere consultar nuestro artículo [Presentando Arth Panel](https://arthmc.xyz/blog/es-ES*presentando-arth-panel).


## Servidores con mods


Aunque la mayoría de el trabajo era hecho en la actualización previa, la característica no fue lista. Ahora puedes ejecutar un servidor con quilt, forge o fabric, y puedes crearlo con un modpack y o añadir mods tú mismo. Aunque hay muchos mods en Modrinth, Arth Panel aún no suporta mods de CurseForge porque ellos no son abiertos con su API y probablemente require algún configuración de tu parte.


## Proxies


Proxies son un tipo de servidor especial que conectan servidores múltiples, hacer ellos verse como uno. La mayoría de los servidores usan ese para tener secciones como minigames, supervivencia y más en un servidor singular. Arth Panel ahora soporta con algún características de conveniencia no son visto en la mayoría de los otros panels. Va a automáticamente configurar alguno sub-server que añades al proxy, y porqué proxies ejecutar tan rápidamente va a automáticamente reiniciar cuando añades un sub-server.


## Server Updates


¡Finalmente puedes actualizar tus servidores, lo cual estaba la última característica principal ausente! También puedes cambiar tu servidor a todas las versiones. Arth Panel notificara cuando tus worldgen mods no pueden funcionar con una versión cierta.


## El sistema de Jars


Al probar la característica actualizar, notamos que por alguna razón no podías actualizar a 1.20 o superior en servidores paper. La causa fue serverjars.com, que por aquel entonces no había actualizado un jar 1.20+. Así que creamos un software llamado JarsMC que Arth Panel usa de respaldo cuando un jar no está en serverjars.com. Por defecto Arth Panel es configurado con nuestra instancia de jarsmc pero puedes ejecutar tu instancia propia si quieres tener un catálogo de jars diferente, o velocidades más rápidas.


## El Menú Mundo


Aunque podías ya descargar tu mundo, ahora puedes subir un mundo o regenerarlo. Puedes elegir qué worldgen mods, tipo de mundo y semilla tendrá.
Explorador de Archivos
Ahora puedes editar ciertos archivos textos en el panel, pudiendo configurar la mayoría de plugins. Por seguridad, no puedes editar archivos como server.properties o eliminar/editar archivos ejecutables.


## El futuro


CurseForge es por mucho la plataforma más popular para mods de Minecraft y va a ser compatible con la próxima actualización. Aunque usualmente Modrinth es más rápido y mejor para mods de cliente (Mods que solo cambian cosas en tu parte así que puedes jugar en servidores sin mods), hay muchos mods grandes que no son en Modrinth. Junto con el soporte para CurseForge, el historial de archivos debería llegar en la próxima actualización, permitiéndote editar archivos sin preocupaciones.
Hemos sido trabajando en ocelot, un "backend principal" que conecta instancias de Quartz (El software de API de Arth Panel). Este te permite añadir más capacidad para más servidores añadiendo más instancias de quartz en computadoras diferentes. Aunque no está listo, deberá ser compatible pronto.


La accesibilidad es una prioridad mayor, y actualmente para instalar el panel necesitas editar archivos múltiples en la carpeta "stores". Queremos hacer un archivo unificado para todos los ajustes que necesitas. En la interfaz, también necesitas buscar muchas carpetas para conectarlo a tu propia instancia de Quartz.


Para salir de la beta, necesitamos hacer muchas cosas. Primero, necesitamos añadir más capas de seguridad. Aunque Arth Panel tiene seguridad para cuentas y servidores, cualquiera que sepa un poco sobre seguridad sabe que nada está 100% seguro. Por lo tanto, necesitamos añadir capas de seguridad adicionales y copias de seguridad para asegurar que no se pierden los datos de nadie (a menos que quieran eliminarlos, claro). En la parte técnica de cosas, necesitamos reorganizar y renombrar algunas de las rutas de API porque, después de salir de la beta, cambios como esos requerirán hacer una versión de API nueva. Hay también muchas áreas en el código que podrían limpiarse, acortarse, y tener más comentarios.
Mantente atento a nuestro Mastodon y blog para actualizaciones nuevas y como siempre, considera consultar o colaborar con nosotros en codeberg.



