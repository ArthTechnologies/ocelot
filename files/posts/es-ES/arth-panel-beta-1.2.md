Arth Panel Beta 1.2 
Un sistema de cuentas, nuevas opciones de plugins y mucho más llega en la actualización Beta 1.2. 
2023-04-02
DiamonC 
https://floss.social/@DiamonC 
https://cdn.masto.host/floss/accounts/avatars/109/207/881/612/624/574/original/6516bdc6b0ff0203.jpeg

---

![imagen-bordered](https://i.imgur.com/WQy6vdr.png)

Ya está aquí la actualización beta 1.2 del Arth Panel con un nuevo sistema de cuentas, muchas correcciones de errores y mucho más. Si no está familiarizado con Arth Panel, consulte nuestro artículo [Introducing Arth Panel](https://arthmc.xyz/blog/introducing-arth-panel).

## Abandono de Pocketbase

Originalmente, Arth Panel se basaba en una aplicación llamada Pocketbase para gestionar las cuentas. La razón principal por la que estamos eliminando esto es que tener una tercera aplicación (Quartz y Observer son las dos primeras) hecha con un lenguaje diferente, diferentes desarrolladores, su propio panel web y base de datos añade mucha complejidad a Arth Panel.  
	Además de la seguridad, hace que el panel sea menos accesible para el usuario medio. Arth Panel se creó para ser lo más accesible posible porque las alternativas eran difíciles de configurar para los principiantes. Nuestro objetivo es que cualquier persona que sepa ejecutar un comando de Linux y cambiar directorios pueda ejecutar Arth Panel.

## El nuevo sistema de cuentas
El nuevo sistema de cuentas almacena las cuentas en el archivo accounts.json. Todo lo que necesita para registrarse o iniciar sesión es una dirección de correo electrónico y una contraseña. Como en la mayoría de los sitios web, las contraseñas se almacenan como hashes (cadenas que no pueden ser rastreadas hasta su contraseña) de forma que si alguien hackeara los ordenadores de su servidor, no podría acceder a las contraseñas de sus usuarios. También se emplean sales (valores aleatorios añadidos al hash) para que los piratas informáticos no puedan buscar contraseñas comunes como «password123».

Puedes restablecer tu contraseña y eliminar tu cuenta a través de la página de gestión de cuentas. Si ha olvidado su contraseña, tendrá que introducir los 4 últimos dígitos de su tarjeta de crédito y su nueva contraseña. Por razones de seguridad, sólo dispone de 5 intentos. 

## Cambios en los pagos
Además de comprobar en Stripe si está suscrito o no, Arth Panel también comprueba cuántas suscripciones tiene. Ahora los usuarios deben pagar por cada servidor.

Si no desea monetizar su panel, puede ir a stores/settings.json y establecer `enablePay` a false. También puede añadir una excepción para usuarios individuales añadiendo `bypassStripe:true` a una cuenta en accounts.json. Deshabilitar la autenticación es todavía experimental por ahora.

## Experiencia de usuario

El objetivo de este panel es ser fácil de usar para todos, incluidos los jugadores principiantes de Minecraft. El botón de cómo unirse a los servidores ahora enlaces a nuestra propia guía sobre cómo unirse a los servidores de Minecraft de Java Edition, móvil, e incluso en las consolas donde los servidores personalizados no son compatibles por defecto. También hemos añadido un botón de «ayuda» en la esquina inferior derecha con un enlace a una nueva discordia que hemos creado para ofrecer apoyo con cualquier problema que los usuarios puedan estar experimentando.

Un problema importante de la versión anterior era la experiencia en móviles. Mientras que la mayoría de las páginas se veían bien, la página /newserver era demasiado pequeña y la página del servidor estaba por todas partes, con botones fuera de sus contenedores y contenedores no centrados. He revisado cada página en modo de simulación móvil y he solucionado estos problemas.

Algunos cambios menores incluyen:  
- la adición de un menú para confirmar que desea eliminar un servidor
- añadir un botón para descargar el archivo del mundo antes de borrar un servidor  
- añadir metadatos como el número de descargas en los resultados de búsqueda de plugins  
- reemplazar la mayoría de las molestas alertas que te impiden hacer clic en cualquier cosa con alertas que aparecen en la parte superior derecha durante unos segundos  

## El futuro
La accesibilidad es una prioridad importante, por lo que vamos a añadir documentación para explicar todo lo que un principiante necesita saber para configurar el panel.

Nuestro principal objetivo ahora es añadir soporte para servidores modded, como forge y quilt, así como soporte para modpacks. La mayor parte del tiempo de desarrollo de esta actualización se dedicó a los servidores modded, sin embargo hay muchos retos a la hora de implementarlos y tenemos que retrasar esto a una futura actualización.

Aunque esta actualización tiene un gran número de cambios de última hora, dado que hemos tenido que reemplazar todo nuestro sistema de cuentas entre otras cosas, esperamos empezar a poner las piezas en su lugar para una versión estable pronto. Las principales cosas en las que trabajar son facilitar la actualización de los servidores a nuevas versiones y hacer que las rutas API sean más consistentes.

 Mantente atento a nuestro Mastodon y a nuestro blog para nuevas actualizaciones, y como siempre, considera echar un vistazo/contribuir a Arth Panel en [codeberg](https://codeberg.org/arth/).
