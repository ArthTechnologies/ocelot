Arth Panel Beta 1.4  
Compatibilidad con CurseForge, configuración sencilla, mejoras de seguridad, cuentas de discordia y mucho más en la actualización beta 1.4.  
2024-01-01
DiamonC 
https://floss.social/@DiamonC 
https://cdn.masto.host/floss/accounts/avatars/109/207/881/612/624/574/original/6516bdc6b0ff0203.jpeg

---

[imagen-bordered](https://i.imgur.com/FmznZoo.png)

Ha pasado exactamente un año desde que [Arth Panel]((https://arthmc.xyz/blog/introducing-arth-panel)) entró en fase beta, y prograss no ha bajado el ritmo ni un ápice, con compatibilidad con CurseForge, mejoras en la interfaz de usuario, muchas nuevas funciones de seguridad y mucho más.

## Seguridad

La seguridad ha mejorado mucho, con muchas nuevas características, comenzando con cloudflare turnstile, que verifica si los usuarios son humanos sin hacerles hacer captchas. Además, hemos añadido copias de seguridad cada 12 horas y búsquedas de virus para los archivos subidos usando `clamdscan`.

### CurseForge

Por fin está aquí el soporte para CurseForge, permitiéndote acceder a decenas de miles de mods y modpacks, como RLCraft.

## Una experiencia de configuración más sencilla

Anteriormente no era muy conveniente conectar tu instancia de observador (frontend) con cuarzo (backend), pero ahora es muy fácil porque ahora puedes establecer esto, y muchos otros ajustes en el observador utilizando variables de entorno. En quartz, solías tener que editar tres archivos diferentes para configurar todo, pero ahora hay un archivo unificado `config.txt`, con descripciones añadidas de cada ajuste.

### Cuentas de Discordia

Ahora puede crear cuentas con Discord en lugar de correo electrónico, que es mucho más conveniente si usted tiene Discord.

## Mejoras en la IU

Arth Panel fue creado para mejorar la experiencia del servidor Minecraft en comparación con las alternativas, y esto incluye cómo se ve. Una prioridad que teníamos en esta actualización era mejorar el diseño, y lo hemos hecho mediante la adición de un efecto de vidrio esmerilado en los modales, la actualización a DaisyUI (una biblioteca que utilizamos que ayuda con los elementos visuales) 4 que viene con varias mejoras de diseño, y un nuevo tema de luz. El tema de luz nunca ha sido muy bonito, pero lo hemos arreglado gracias al tema nord de DaisyUI en el que se basa el nuevo tema de luz. También hemos corregido todos los errores que ocurrían cuando el modo luz estaba activado, especialmente los errores con gradientes.

## Pago 

En lugar de depender de los enlaces de pago de stripe, que no le permiten seleccionar diferentes planes, Arth Panel ahora tiene su propia página de pago, todavía usando stripe, por supuesto. Le permite elegir entre planes modded y básicos, que pueden ser de diferentes precios, aunque todavía no hemos hecho que no pueda crear servidores modded en planes básicos.

## ¡Y mucho más!

También hay numerosos pequeños cambios que juntos marcan una gran diferencia. He aquí una lista:

- Arreglado el poder hacer clic en botones no interactivos como «empezar».
- Fijo youtube incrustaciones en las descripciones mod no tener el tamaño adecuado
- Actualizado a DaisyUI 4 desde DaisyUI 2
- Añadida la opción de desactivar / activar mods
- Añadida la posibilidad de cambiar la versión de un mod / plugin o modpack
- Añadido recuento de descargas a los plugins, hecho plugin y mod y modpack resultados de la búsqueda tienen el mismo aspecto
- Los mods worldgen en /newserver son ligeramente más grandes, se agrandan al pasar el ratón por encima y un tooltip muestra el nombre.
- Añadida la función «cargar más» a la búsqueda de mods, plugins y paquetes de mods.
- Corregidos varios errores con locales/langs no soportados.
- Se ha corregido el error que impedía hacer clic en el botón «Olvidé mi contraseña».
- Añadida la opción «ordenar por» a las búsquedas
- Cambio a java 8 desde java 11 para versiones antiguas debido a diversos problemas.
- Corrección de algunos modales que no cubrían toda la pantalla (por ejemplo, podía haber una barra delgada a la izquierda de la pantalla en la que el contenido de fondo no se atenuaba).
- Corrección de varios iconos que se encogían cuando el espacio en sus contenedores era limitado.
- Añadida la distinción entre dependencias «requiere» y «funciona con
- Añadido el botón «ir a la descripción» en móviles porque las versiones están en la parte superior y puede costar mucho desplazarse para llegar a él.
- Corregidos varios errores visuales con los resultados de búsqueda y los cargadores de esqueletos
- Ahora se recomienda Docker para el frontent porque soporta variables de entorno.
- El botón de la página en la que se encuentra en la barra de navegación ahora está resaltado para ayudar a los usuarios a asociar el botón con la página.
- Se ha añadido la posibilidad de ver los registros de cambios de una versión de un mod/modpack/plugin.
- Añadido escaneo de virus opcional para las subidas de mundos usando `clamdscan`.
- Corregida la posibilidad de desplazarse en los modals por debajo del actual, causando errores visuales
- Arreglado el botón de terminal a pantalla completa siguiendo la salida del terminal en lugar de permanecer en la esquina superior derecha.
- Las alertas ahora pueden ser de información o advertencia, no sólo de error, también duran un poco más.
- Control + S ahora guarda los cambios en el editor de archivos
- Añadidos descriptores para los diferentes softwares de servidor
- Añadido el botón de cambio de idioma en la parte inferior izquierda
- Añadida ordenación alfabética al entrelazar mods/plugins
- Añadido soporte para avatares de perfil para cuentas de discordia
- Corregidos errores al borrar cuentas y servidores
- Corregidos errores al descargar mundos cuando un modpack usa una carpeta 'World' en lugar de 'world'.
- Añadido la característica de copia de seguridad para su instancia de quartz cada 12 horas.
## El futuro
La próxima actualización puede ser un poco menos emocionante que está, como nos enfoque principiante es para mejorar la estabilidad de todo y fijar errores. También necesitamos limpiar el código y simplificar algunas de las rutas de API. La compatibilidad con ocelot, una programa que conecta instancias de quartz múltiples, es también una prioridad de mejora.
Si quieres usar Arth Panel o ayudar con traducciones o el código, vas a nuestro página de [codeberg](https://codeberg.org/arth/).

