# Auditoría previa a Git

Fecha: 2026-08-29

## Resultado

- README principal y README de cada componente revisados.
- AGPLv3+ seleccionada para el software, CC BY-SA 4.0 para documentación y
  recursos propios, y política separada para la marca Q'Suene.
- Avisos de componentes externos documentados.
- `.gitignore` cubre audios, secretos, configuración local, bases de datos,
  dependencias y artefactos de compilación.
- No se encontraron audios, `.env`, claves privadas, bases locales ni archivos de
  preferencias dentro de los  archivos publicables.
- DJ App: 3 pruebas, lint, compilación y PyInstaller correctos.
- Backend: 29 pruebas correctas y dependencias consistentes.
- WebGuest/Landing: compilación correcta y auditoría npm sin vulnerabilidades.
- Prueba manual: una sola ventana, interfaz completa renderizada por WebView2 y
  cierre normal sin procesos residuales.
- Autoprueba del paquete: importación interna de SpotDL y ejecución del FFmpeg
  empacado correctas, sin abrir la interfaz.
- Proyecto anterior conservado como respaldo; `qsuene` continúa aislado.

## Pendientes ajenos al primer commit

- Elegir entre distribuir el FFmpeg GPLv3 actual cumpliendo sus obligaciones o
  adoptar una compilación LGPL adecuada.
- Construir, firmar y probar el MSI en Windows 10 y Windows 11 limpios.
- Validar Docker Compose en una máquina que tenga Docker.
- Ejecutar la prueba de producción con PostgreSQL, Redis, Apache y HTTPS.

Git permanece sin inicializar y no se preparó ningún commit.
