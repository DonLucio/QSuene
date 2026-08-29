# Q'Suene DJ App

Aplicación de escritorio para Windows que reproduce la biblioteca local, gestiona
la cola de fiesta y sincroniza catálogo, reproducción, deseos y participantes con
la plataforma pública.

## Estructura

- `app/`: Flask local, worker de SpotDL, metadatos y ventana pywebview.
- `frontend/`: interfaz React/Vite.
- `packaging/`: configuración de PyInstaller; el MSI se añadirá aquí.

## Datos locales

Durante el desarrollo se crean `descargas`, `ModoFiesta`, archivos JSON y SQLite.
Todos están excluidos de Git. Antes del MSI se migrarán a `%LOCALAPPDATA%\QSuene`.

## Requisitos de desarrollo

- Windows 10 u 11.
- Python 3.10.
- Node.js y npm.
- Microsoft Edge WebView2 Runtime.
- FFmpeg y FFprobe. Si no fueron instalados con Scoop, configure
  `QSUENE_FFMPEG_BIN` con el directorio que contiene ambos ejecutables.

## Construcción reproducible

Desde la raíz del proyecto, use siempre la rutina oficial:

```powershell
.\scripts\build-desktop.ps1 -Version "1.0.0" -RefreshDependencies
```

La rutina comprueba procesos abiertos, prepara dependencias, ejecuta pruebas,
lint y compilación del frontend, valida Python y construye el ejecutable. No abre
la aplicación al terminar, para impedir procesos secundarios o ventanas durante
la automatización. El resultado queda en `desktop/packaging/bin/QSuene.exe` y
`build-info.json` registra versión, tamaño y SHA-256.

En compilaciones posteriores se puede omitir `-RefreshDependencies`. El parámetro
`-SkipTests` queda reservado para diagnóstico local y no debe utilizarse para una
release.

## Ejecución de desarrollo

```powershell
npm --prefix frontend ci
npm --prefix frontend run build
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.venv\Scripts\python.exe app\main.py
```

La rutina incorpora SpotDL, FFmpeg y FFprobe, y ejecuta una comprobación interna
del paquete sin abrir la interfaz. Antes de publicar una versión se debe probar el
artefacto en instalaciones limpias de Windows 10 y 11 con WebView2.
