Arth Panel Beta 1.3 
7 meses de mejoras culminan en la actualización Beta 1.3. 
2023-11-02
DiamonC 
https://floss.social/@DiamonC 
https://cdn.masto.host/floss/accounts/avatars/109/207/881/612/624/574/original/6516bdc6b0ff0203.jpeg

---

![imagen-bordered](https://i.imgur.com/7PD9CMz.png)

Después de 7 meses, por fin está aquí la actualización beta 1.3 de Arth Panel con una experiencia significativamente más estable, soporte para proxies, servidores modded, actualización de servidores, un explorador de archivos y mucho más. Si no está familiarizado con Arth Panel, puede consultar nuestro artículo [Presentación de Arth Panel](https://arthmc.xyz/blog/introducing-arth-panel).

## Servidores con mods

Aunque la mayor parte del trabajo se realizó en la última actualización, la función aún no estaba lista. Ahora, puedes ejecutar un servidor modded con quilt, forge, o fabric, y puedes crearlo con un modpack, y/o añadir mods manualmente. Aunque el catálogo de mods es bastante amplio en modrinth, el Panel Arth aún no es compatible con los mods de CurseForge, ya que son mucho menos abiertos con sus APIs y es probable que requiera alguna configuración por parte del propietario del panel.

## Proxies

Los proxies son un tipo especial de servidores que conectan múltiples servidores, haciéndolos aparecer como uno solo. La mayoría de los servidores utilizan esto para tener una sección de minijuegos, una sección de supervivencia, etc. en un solo servidor. El Panel Arth ahora los soporta, con algunas características de conveniencia que no se ven en la mayoría de los otros paneles. Configurará automáticamente cualquier sub-servidor que añadas con el proxy si está en el mismo panel, y como los proxies se cargan tan rápido, lo reiniciará automáticamente si añades un sub-servidor para aplicar el cambio.

## Actualización de servidores

Por fin puedes actualizar tus servidores, que era la última característica básica que faltaba. También puedes cambiar tu servidor a cualquier versión disponible. Arth Panel te dirá cuando tus mods worldgen no funcionen con una versión determinada, para que puedas borrarlos o no actualizarlos en consecuencia.

## Sistema de tarros

Al probar la función de actualización, descubrimos que, por alguna razón, no se podía actualizar a la versión 1.20 o superior en los servidores de papel. La causa resultó ser serverjars.com, que no ha subido un jar 1.20+ para paper **hasta el día de hoy**. Así pues, hemos creado un software llamado jarsmc que arth panel utiliza como copia de seguridad siempre que no haya un jar en serverjars.com. De forma predeterminada, Arth Panel ya está configurado con nuestra instancia de jarsmc, pero usted puede ejecutar la suya propia si desea disponer de un catálogo de tarros diferente o de mayor velocidad.

## Menú Mundo

Mientras que antes podías descargar tu mundo, ahora puedes subir un mundo, o regenerar un mundo. Puedes elegir qué mods worldgen tendrá, su tipo de mundo y su semilla.

## Explorador de archivos

Ahora puedes editar ciertos archivos de texto desde el panel, lo que te permite configurar la mayoría de los plugins. Por seguridad, no puedes editar archivos como server.properties, o borrar/editar archivos ejecutables.

## El Futuro
CurseForge es de lejos la mayor plataforma para mods de Minecraft, y será soportada en la próxima actualización. Mientras Modrinth es a menudo más rápido, y es mejor para los mods del lado del cliente (mods que sólo cambian las cosas en su extremo, por lo que todavía se puede jugar en los servidores no modded), hay muchos grandes mods y Modpacks que simplemente no están en Modrinth. Junto con el soporte de CurseForge, el Historial de Archivos también debería llegar en la próxima actualización, permitiéndote editar archivos sin preocupaciones.

Hemos estado trabajando en ocelot, un backend maestro que conecta instancias de quartz, el backend de Arth Panel. Esto permite añadir capacidad para más servidores añadiendo más instancias de quartz en distintos ordenadores. Aunque aún no estaba listo para esta actualización, pronto estará disponible.

La accesibilidad es una prioridad importante, y ahora mismo, para configurar el panel tiene que ir a la carpeta de almacenes, y editar valores en varios archivos. Queremos poner todos los ajustes que necesita en un archivo unificado. En el frontend, también hay que rebuscar en algunas carpetas para conectarlo a tu propia instancia de quartz.

Para salir de la beta, tenemos que hacer varias cosas. En primer lugar, tenemos que añadir más capas de seguridad. Aunque Arth Panel dispone de seguridad para cuentas y servidores, cualquiera que sepa algo sobre ciberseguridad sabe que nada es 100% seguro. Por lo tanto, necesitamos añadir capas adicionales de seguridad, así como copias de seguridad para asegurarnos de que no se pierden los datos de nadie (a menos que quieran borrarlos, claro). En el aspecto técnico, tenemos que reorganizar y cambiar el nombre de algunas rutas de la API para que tengan más sentido, porque cuando salgamos de la versión beta, este tipo de cambios requerirán una versión completamente nueva de la API. También hay muchas áreas en el código que podrían limpiarse, acortarse y tener más comentarios.

Mantente atento a nuestro Mastodon y a nuestro blog para nuevas actualizaciones, y como siempre, considera echar un vistazo/contribuir a Arth Panel en [codeberg](https://codeberg.org/arth/).