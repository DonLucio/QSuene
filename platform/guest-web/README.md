# Landing y WebGuest

Cliente React/Vite orientado a teléfonos. Permite descubrir salas públicas,
entrar mediante QR o código, buscar el catálogo, programar canciones y recibir
estado de reproducción y notificaciones personales.

```powershell
npm ci
npm run dev
npm run build
```

En desarrollo `VITE_API_URL` puede apuntar al backend local. En producción se
usa el mismo origen de `qsuene.com`.

La URL sin parámetros muestra la landing. Los accesos privados usan `?room=CODIGO`;
al regresar a la página principal el cliente elimina el código mediante navegación
de reemplazo para que una recarga no vuelva a abrir la sala anterior.
