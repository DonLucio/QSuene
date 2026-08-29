# Q'Suene

**La música la ponemos todos.**

Q'Suene combina un reproductor de escritorio para el DJ con una plataforma web
móvil para que los invitados consulten la biblioteca y programen canciones en
tiempo real.

## Componentes

- `desktop/app`: servidor local, reproducción, descargas y persistencia de la DJ App.
- `desktop/frontend`: interfaz React integrada en la aplicación de escritorio.
- `desktop/packaging`: construcción de PyInstaller y futuro instalador MSI.
- `platform/backend`: FastAPI, Socket.IO, PostgreSQL y Redis.
- `platform/guest-web`: landing pública y cliente móvil de invitados.
- `platform/contracts`: contratos versionados de eventos en tiempo real.
- `platform/deploy`: plantillas de Apache, systemd y herramientas operativas.

## Desarrollo del escritorio

```powershell
python -m venv desktop\.venv
desktop\.venv\Scripts\python.exe -m pip install -r desktop\requirements-dev.txt
npm --prefix desktop\frontend ci
npm --prefix desktop\frontend run build
desktop\.venv\Scripts\python.exe desktop\app\main.py
```

## Desarrollo de la plataforma

```powershell
python -m venv platform\backend\.venv
platform\backend\.venv\Scripts\python.exe -m pip install -e "./platform/backend[dev]"
npm --prefix platform\guest-web ci
```

Consulte [platform/README.md](platform/README.md) para ejecutar y desplegar los
servicios.

## Verificación

```powershell
npm --prefix desktop\frontend run lint
npm --prefix desktop\frontend run build
npm --prefix platform\guest-web run build
platform\backend\.venv\Scripts\python.exe -m pytest platform\backend -q
platform\backend\.venv\Scripts\python.exe -m pytest desktop\app\test_download_jobs.py -q
```

Para generar el ejecutable de escritorio use exclusivamente:

```powershell
.\scripts\build-desktop.ps1 -Version "1.0.0" -RefreshDependencies
```

La rutina no ejecuta ni abre la aplicación durante el empaquetado.

## Datos y música

El repositorio no contiene música, bibliotecas personales, bases SQLite,
credenciales ni archivos `.env`. Cada usuario es responsable de contar con los
derechos necesarios sobre el contenido que reproduce o descarga.

## Créditos

Desarrollado por [Gonzalo Andrés Lucio](https://www.gonzaloandreslucio.com).

## Licencia

El software Q'Suene se distribuye bajo [GNU AGPLv3 o posterior](LICENSE): las
versiones modificadas, incluidas las ofrecidas por red, deben mantener disponible
su código fuente. La documentación y los recursos propios usan
[CC BY-SA 4.0](DOCUMENTATION_LICENSE.md). El nombre y la identidad oficial se
rigen por la [política de marca](TRADEMARKS.md). Los componentes externos
conservan sus licencias; consulte [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
