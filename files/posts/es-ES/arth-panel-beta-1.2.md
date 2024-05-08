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


Originalmente, Arth Panel usaba una aplicación llamada Pocketbase para administrar cuentas. El razón principal de abandonarlo es para tener una tercera aplicación (El API Quartz y la interfaz Observer siendo el primero dos) con una idioma de programación diferente, programadores diferentes, y su propia interfaz en línea y base de datos añada muchas complejidades a Arth Panel.
   Además de seguridad, hace el panel menos accesible a tu usuario medio. Arth Panel fue creado para ser lo más accesible posible porque las alternativas fueron muy difícil para principiantes instalar.


## El sistema de cuentas nueva
El sistema de cuentas nueva reserva cuentas en el archivo accounts.json. Todo lo que necesitas es un correo electrónico y contraseña para iniciar sesión o registrar. Como la mayoría de los sitos web, contraseñas son se reservan como hashes (texto que no puede ser rastrear a tu contraseña) así que si alguien hackeado en tu computadora servidor, no puede ver los contraseñas de tus usurarios. Sales (números o textos aleatorios que son añadido a cada hash) son también usados prevenir hackers buscando de contraseñas comunes como "contraseña123".


Puedes restablecer tu contraseña y eliminar tu cuenta desde la pagina de administrar cuenta. Si olvidado tu contraseña, necesitarías ingresar los últimos 4 dígitos de tu tarjeta y tu contraseña nuevo. Para mantener seguridad, solo tienes 5 intentos.


## Cambios de Pagos
Además de verificar Stripe para una suscripción, Arth Panel también verifica cuantos suscripciones tienes. Ahora usuarios necesitan pagar para cada servidor.


Si no quieres monetizar tu panel puedes configurarlo para entrar en `stores/settings.json` y poner `enablePay` a `false`. También puedes añadir una excepción para usuarios individuales para añadir `bypassStripe:true` a una cuenta en `accounts.json`. Desactivar autenticación es experimental por ahora.


## Experiencia de usuarios


El objetivo de este panel es ser fácil usar para alguien, incluyendo jugadores de Minecraft principiantes. El botón de cómo unirse a servidores ahora incluye nuestro propio guía de unirse a servidores de Minecraft desde la edición de Java, móvil e incluso videoconsola, donde servidores a la media no son compatibles de forma predeterminada. Además añadimos un botón de ayuda en la esquina inferior derecha con un enlace a nuestro servidor de Discord que configuramos ayudar con cualquier problema que podrías estar experimentando.


Una cuestión mayor con la versión previa fue la experiencia en móvil. Aunque la mayoría de las páginas no fueron de mal ver, la página `/newserver` fue demasiada pequeña y la página servidor fue dispersa, con botones que fuera de sus envases y envases no siendo centrado, pero ahora cada página ha sido corregió.


algunos cambios menores incluyen: 
-  añadir un menú para confirmar que quieres eliminar un servidor.
-  añadir un botón para descargar el archivo de mundo antes de eliminar un servidor.
-  añadir información como el numero de descargas en resultados de buscar de plugins.
-  sustituir la mayoría de las alertas molestas con alertas que solo existen para unos segundos


## El Futuro
Accesibilidad está una prioridad importante, así que vamos a añadir documentación explanar todo una principiante necesita saber instalar el panel.


Nuestro foco ahora está añadir compatibilidad con mods con forge y quilt, y compatibilidad con modpacks también. La mayoría de el tiempo de esa actualización fue pasaba trabajando en servidores con mods, pero hay muchos retos con implementando ellos y necesitamos demorar ese a la próxima actualización.


Aunque esta actualización tiene muchos cambios que rompen la compatibilidad, como necesitamos sustituir todo nuestro sistema de cuentas, esperamos iniciar trabaja para una actualización estable pronto. Las cosas principales trabajar en son lo hacer fácil para actualizar servidores y hacer las rutas de el API más constante.



