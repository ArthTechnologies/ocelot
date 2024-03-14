Arth Panel Actualización de Plugins
Plugins, correcciones de errores mayores y mucho más llegan en nuestra actualización beta 1.1.
2023-02-14
DiamonC
https://floss.social/@DiamonC
https://cdn.masto.host/floss/accounts/avatars/109/207/881/612/624/574/original/6516bdc6b0ff0203.jpeg


---


![image-bordered](https://i.imgur.com/sHstVuD.png) 


Después de poco más de un mes después de beta 1.0, ¡la actualización beta 1.1 de Arth Panel está aquí! Si no estás familiarizado con Arth Panel, consideras consultar nuestro artículo [Presentando Arth Panel](https://arthmc.xyz/blog/es-ES*presentando-arth-panel/).


## Plugins


Plugins son un camino grande para añadir funcionalidad para tu servidor, hacer más divertido el juego, o dar seguridad adicional con características como copias de seguridad. Modrinth es una plataforma moderna y rapidísimo para obtener mods y plugins, así que decidimos añadir una sección para buscar y añadir plugins de Modrinth. Además, hay una sección para plugins presentados, que nuestra algunos de los plugins más comunes de tanto Modrinth y GitHub.
   Junto con Geyser, ahora Floodgate se encuentra preinstalado también. Floodgate les permita jugadores de la edición de Bedrock jugar sin necesitar una cuenta de la edición Java. Finalmente, añadimos un botón de Administrar Plugins. Puedes ver y eliminar todos los plugins de Modrinth o GitHub y plugins preinstalados.


## Correcciones de Errores


El terminal ha estado la parte con más errores en la interfaz desde su introducción. Un gran problema fue que todo fue en una línea, haciendo el terminal muy difícil para leer. Otra cuestión muy importante fue comandos no enviando porque el API verificó si un comando nuevo fue enviado cada 200 segundos, así que si más que un solo comando eran enviado en ese tiempo el terminal podría romperse hasta que el servidor se reiniciaba. Tanto de estos errores han sido corregía, permitiéndonos centrarnos en características nuevas.


Hemos añadido muchas características pequeñas como el worldgen mod "Structory", atajos de commandos, código más eficiente, y UI más intuitivo. También hemos añadido opciones experimentales que se necesitan habilitar que te permiten eliminar pagos y autenticación en tu panel, una opción excelente si tu panel solo para tus amigos y personas en que confias.


## El Futuro


Ahora nuestra primer prioridad es mejorar la seguridad de los servidores de personas. Nunca recomendamos ejecutar Arth Panel en producción (permitiendo personas en que no confías acceder tu panel) porque lo actualmente no tiene seguridad de contraseñas propio. Haremos un sistema de seguridad de contraseñas que probablemente significa sustituyendo pocketbase con nuestro sistema propio también.
   Otra prioridad es aumentar accesibilidad de instalar el panel. Queremos nuestra documentación explicar toda la información que necesitas saber para instalar nuestro panel, y también queremos iniciar trabajo en cuestiones de docker, después de tomar un descanso después cuestiones con dispositivos de ARM. Además, queremos mejorar la experiencia con dispositivos móviles y en el modo no auth, que está actualmente experimental. Mantente atento a nuestro Mastodon y blog para actualizaciones nuevas y como siempre, consideras consultar o colaborar con nosotros en [codeberg](https://codeberg.org/arth).







