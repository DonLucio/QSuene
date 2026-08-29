# Despliegue en Ubuntu con Apache

1. Instalar Docker, Docker Compose, Apache y Certbot.
2. Copiar `.env.example` a `.env` y cambiar la clave secreta, dominio y claves.
3. Ejecutar `docker compose up -d --build`.
4. Publicar los contenedores solo en `127.0.0.1` antes de producción.
5. Habilitar módulos de Apache:

```bash
sudo a2enmod proxy proxy_http proxy_wstunnel headers rewrite ssl
```

6. Adaptar `platform/deploy/apache/que-suene-party.conf`, habilitar el sitio y emitir el
   certificado con Certbot.

También puede instalarse `platform/deploy/systemd/que-suene-party.service` cuando el
backend se ejecuta fuera de Docker. Copie las variables de `.env.example` a
`/etc/que-suene/party.env`, genere una clave JWT aleatoria de al menos 64
caracteres y restrinja el archivo a root. En producción el servidor se niega a
arrancar con la clave de desarrollo o sin PostgreSQL/Redis.

Apache requiere `proxy`, `proxy_http`, `proxy_wstunnel`, `headers`, `rewrite` y
`ssl`. La plantilla preserva `X-Forwarded-Proto`, enruta Socket.IO con upgrade a
WebSocket y sólo expone Uvicorn en `127.0.0.1`.
