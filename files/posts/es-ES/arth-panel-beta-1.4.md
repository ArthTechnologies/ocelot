Arth Panel Beta 1.4 
Compatibilidad con CurseForge, cuentas de discord, actualizaciones seguridades, configuración fácil, y mucho más están aquí en beta 1.4.
2024-01-01
DiamonC
https://floss.social/@DiamonC
https://cdn.masto.host/floss/accounts/avatars/109/207/881/612/624/574/original/6516bdc6b0ff0203.jpeg


---


![image-bordered](https://i.imgur.com/FmznZoo.png)


¡Hace mas que un año después de [Arth Panel]((https://arthmc.xyz/blog/introducing-arth-panel)) empiezó beta, y progreso no ha retrasa un poco, con compatibilidad con CurseForge, mejores con la interfaz, muchos mejores seguridades, y mucho más!


## Seguridad
Seguridad ha mejoró mucho, con muchas características nuevas como el verificar que usted es humano botón con Cloudflare, copias de seguridad cada 12 horas, y buscar en virus usando `clamdscan` cuando un archivo de mundo está subiendo.
### Compatibilidad con CurseForge
Añadimos compatibilidad con CurseForge además de Modrinth. CurseForge es la plataforma más grande para mods y tiene muchos mods y modpacks increíbles como RLCraft. Para permitirlo, necesitas obtener una clave de API de CurseForge.
## Configuración más fácil
No fue previamente muy fácil para conectar tu instancia observer (interfaz) con quartz (backend), pero ahora es muy fácil porque ahora puedes configurar este y muchas otras configuraciones en observer con variables environnementales. Previamente en quartz tuviste que editar 3 archivos diferentes para configurar todo pero ahora hay un archivo singular para configuración, con descripciones de cada configuración.
### Cuentas de Discord
Además de cuentas de correo electrónico, puedes ahora crear una cuenta con Discord, que es mucho más conveniente si tienes Discord.
## Mejores Interfaces
Arth Panel fue creado para mejorar la experiencia de servidor de Minecraft comparado con los alternativos, y este incluye cómo se ve. Una prioridad tuvimos en esta actualización fue mejorar el diseño e hicimos este para añadir un efecto de desenfoque a los modals, actualizar a DaisyUI (una biblioteca de programas usamos para ayudarnos con haciendo elementos visuales) v4, que incluye mejores visuales varios, y una tema luz nueva. El tema luz nunca ha sido muy bonito pero fijamos este gracias al tema nord de DaisyUI, que el tema luz nueva está basado en. Además fijamos todos errores que pasaron cuando el tema luz fue permitido, especialmente errores con gradientes.
## Página de chequeo




En vez de usar enlaces pagos de stripe que no permitirte elegir planes diferentes, Arth Panel ahora tiene su propio página de chequeo que aún usa stripe por supuesto. Te permite elegir un plan, modded o basic, que pueden cuestan precios diferentes aunque no bloquear a los usuarios de crear servidores con mods en planes básicos ya.
## El futuro
La próxima actualización puede ser un poco menos emocionante que está, como nos enfoque principiante es para mejorar la estabilidad de todo y fijar errores. También necesitamos limpiar el código y simplificar algunas de las rutas de API. La compatibilidad con ocelot, una programa que conecta instancias de quartz múltiples, es también una prioridad de mejora.
The next update will likely be a bit less exciting than this one or the one before, as our main focus is to improve the stability of everything and fix bugs. We also need to clean up the code to make it more efficient and easier to read, and simplify some of the API routes. Support for ocelot, a software that connects multiple quartz instances together, is also a major priority.
Si quieres usar Arth Panel o ayudar con traducciones o el código, vas a nuestro página de [codeberg](https://codeberg.org/arth/.

