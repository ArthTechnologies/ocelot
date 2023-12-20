Arth Panel Actulización Beta 1.2
¡Un sistema de cuentas, nuevas opciones y mucho más!
2023-04-02
DiamonC 
https://floss.social/@DiamonC 
https://cdn.masto.host/floss/accounts/avatars/109/207/881/612/624/574/original/6516bdc6b0ff0203.jpeg

---

![image-bordered](https://i.imgur.com/WQy6vdr.png)

¡La actualización beta 1.2 de Arth Panel está aquí con una sistema de cuentas nueva, muchas correcciones de errores y más! Si no estás familiarizado con Arth Panel, consideras consultar nuestro artículo [Presentando Arth Panel](https://arthmc.xyz/blog/es-ES*presentando-arth-panel/).

## Abandonar Pocketbase

Originalmente, Arth Panel usaba una aplicación llamada Pocketbase para administrar cuentas. El razón principal de abandonarlo es que tener una tercera aplicación (El API Quartz y la interfaz Observer siendo el primero dos) con una idioma de programación diferente, programadores diferentes, y su propio interfaz en línea y base de datos añada muchas complejidades a Arth Panel.
	Además de seguridad, hace el panel menos accesible a tu usuario medio. Arth Panel fue creado ser lo mas accesible posible porque los alternativos fueron muy difícil para principiantes para instalar.

## La sistema de cuentas nueva
La sistema de cuentas nueva reserva cuentas en el archivo accounts.json. Todo lo que necesitas es un correo electrónico y contraseña para iniciar sesión o registrar. Como la mayoría de los sitos web, contraseñas son se reservan como hashes (texto que no puede ser rastrear a tu contraseña) así que si alguien hackeado en tu computadora servidor, no puede ver los contraseñas de tus usurarios. Sales (números o textos aleatorios que son añadido a cada hash) son también usa prevenir hackers buscando de contraseñas comunes como "contraseña123".

Puedes restablecer tu contraseña y eliminar tu cuenta desde la pagina de administrar cuenta. Si olvidado tu contraseña, necesitaras ingresar los últimos 4 dígitos de tu tarjeta y tu contraseña nuevo. Para mantener seguridad, solo tienes 5 intentos.

## Cambios de Pagos
Ademas de verificar stripe para una suscripción, Arth Panel también verifica cuantos suscripciones tienes. Ahora usuarios necesitan pagar para cada servidor.

Si no quieres monetizar tu panel puedes entrar en `stores/settings.json` y poner `enablePay` a `false`. También puedes añadir un excepción para usuarios individuos por añadir `bypassStripe:true` a una cuenta en `accounts.json`. Desactivar autenticación es experimental por ahora.

## Experiencia de usuarios

El objetivo de este panel es ser fácil usar para alguien, incluyendo jugadores de Minecraft principiantes. El botón de cómo unirse a servidores ahora incluye nuestro propio guía de unirse a servidores de Minecraft desde la edición de Java, móvil e incluso videoconsola, donde servidores a la media no son compatibles de forma predeterminada. Además añadimos un botón ayuda en la esquina inferior derecha con un enlace a nuestro servidor de Discord que configurábamos ayudar con cualquier problema que podrías estar experimentando.

Una cuestión mayor con la versión previa fue la experiencia en móvil. Aunque la mayoría de las páginas no fueron de mal ver, la página /newserver fue demasiada pequeña y la página servidor fue disperso, con botones fuera de sus envases y envases no siendo centrado, pero ahora cada página ha sido corregía.

algunos cambios menores incluyen:  
-  añadir un menú para confirmar que quieres eliminar un servidor. 
-  añadir un botón para descargar el archivo de mundo antes de eliminar un servidor.
-  añadir información como el numero de descargas en resultados de buscar de plugins.
-  sustituir la mayoría de las alertas molestas con alertas que solo existen para unos segundos

## El Futuro
Accesibilidad está una prioridad importante, así que añadiremos documentación explanar todo una principiante necesita saber installer el panel.

Nuestro foco ahora está añadir compatibilidad con mods con forge y quilt, y compatibilidad con modpacks también. La mayoría de el tiempo de esa actualización fue pasaba trabajando en servidores con mods, pero hay muchos retos con implementando ellos y necesitamos demorar ese a la próxima actualización.

Aunque esa actualización tiene muchos cambios que rompen la compatibilidad, como necesitamos sustituir todo nuestro sistema de cuentas, esperamos iniciar trabaja para una actualización estable pronto. Las cosas principales trabajar en son lo hacer fácil para actualizar servidores y hacer las rutas de el API más constante.

## Arth Hosting
Estamos lanzando nuestro propio servicio con Arth Panel se llama Arth Hosting. Ofrecerá servidores de Minecraft a $3/mes por el resto de 2023, y $5/mes después. Si no tiene computadores de servidores o quiere mantenernos, considere consultarlo a [arthmc.xyz](https://arthmc.xyz/).