# Componentes de terceros

Q'Suene incorpora o utiliza bibliotecas de terceros bajo sus respectivas
licencias. Entre los componentes principales se encuentran SpotDL (MIT), FFmpeg
(GPLv3 en la compilación completa actualmente empaquetada), pywebview (BSD), FastAPI
(MIT), React (MIT), Socket.IO (MIT), PostgreSQL y Redis.

La distribución final debe conservar los avisos de licencia exigidos por cada
componente. Antes de publicar el MSI se debe incluir el texto GPLv3 y cumplir las
obligaciones de distribución de código fuente correspondientes a la compilación
de FFmpeg, o reemplazarla por una compilación LGPL compatible con las funciones
que utiliza Q'Suene.

SpotDL no descarga audio desde Spotify. Usa Spotify para metadatos y obtiene el
audio desde proveedores compatibles. El usuario es responsable de utilizar la
aplicación conforme a la legislación, condiciones de servicio y derechos sobre
el contenido aplicables en su jurisdicción.
