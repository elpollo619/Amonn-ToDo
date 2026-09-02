# 🏠 Instalar Amonn en tu NAS Ugreen (paso a paso)

Guía para dejar **todo** funcionando en tu **Ugreen NASync DH4300 Plus**
(UGOS Pro): la app, la base de datos y el agente de WhatsApp. Los datos se
guardan en la carpeta `data/` del NAS y **nunca salen de tu casa**.

Hay dos caminos. El **método gráfico** (recomendado) no necesita comandos ni
copiar código. Más abajo está el método por SSH por si lo prefieres.

---

# ✅ Método gráfico (recomendado, sin comandos)

Usa la app **Docker** de tu NAS y una imagen ya construida (se compila sola en
GitHub, tú no compilas nada).

## Paso 1 — Hacer pública la imagen (un solo clic, una vez)

La imagen se publica automáticamente en GitHub. Para que el NAS pueda
descargarla sin contraseña, hazla pública una vez:

1. Entra en `https://github.com/elpollo619/Amonn-ToDo` → pestaña **Packages**
   (o `https://github.com/users/elpollo619/packages`).
2. Abre el paquete **amonn-todo** → **Package settings** → sección **Danger
   Zone** → **Change visibility** → **Public**.

> Si prefieres mantenerla privada, se puede, pero entonces hay que hacer
> `docker login ghcr.io` en el NAS. Público es lo más simple.

## Paso 2 — Crear el Proyecto en Docker

1. Abre la app **Docker** en UGOS → pestaña **Projekt / Proyectos** → **Crear**.
2. Ponle un nombre: `amonn`.
3. Elige (o crea) una carpeta para el proyecto, por ejemplo `docker/amonn`.
   Ahí se guardará la subcarpeta `data/` con tu base de datos.
4. Cuando pida el contenido del `docker-compose`, elige la opción de
   **pegar / crear texto** y pega **todo** el contenido del archivo
   [`docker-compose.nas.yml`](../docker-compose.nas.yml) de este proyecto.
5. **Cambia solo las 3 líneas marcadas con 🔴** (contraseñas inventadas + la
   clave de tu Gateway):
   - `POSTGRES_PASSWORD` / `DATABASE_URL`: la contraseña de la base de datos
     (aparece **dos veces**, debe ser **idéntica** y sin símbolos raros),
   - `JWT_SECRET`: una frase larga y aleatoria,
   - `WA_API_KEY`: la clave de tu Gateway (en `data/.api-key`, con `cat
     data/.api-key` desde la Terminal del contenedor del Gateway).

   El resto (`WA_API_URL`, la sesión, el tiempo real) ya viene puesto: Amonn
   habla con tu Gateway por la red interna y **detecta la sesión solo**.
6. Dale a **Crear / Arrancar**. La primera vez tarda un par de minutos en
   descargar. Cuando termine verás 2 contenedores: `db` y `server`.

## Paso 3 — Abrir la app

En el navegador:

```
http://IP-DE-TU-NAS:8080
```

Regístrate con tu email, crea tu equipo y empieza a añadir tareas. 🎉

## Paso 4 — WhatsApp (se conecta solo)

**No hay que hacer nada más.** Amonn **reutiliza tu OpenWA Gateway** (ya
vinculado a WhatsApp, sin QR nuevo) y al arrancar:

- **detecta la sesión** de WhatsApp automáticamente, y
- se **suscribe a los mensajes en tiempo real** (Socket.IO, `/events`).

Así, los recordatorios salen por tu Gateway y, cuando alguien responde
**SÍ/NO**, Amonn lo recibe al instante y actualiza la tarea. ✅ No necesita
webhook, ni abrir puertos, ni tocar la seguridad del Gateway.

Para comprobarlo, mira el **Protokoll** de `amonn-server`; verás:
```
[wa] sesión seleccionada: ...
[wa] tiempo real conectado; suscribiendo a la sesión
```

> 💡 Cada persona del equipo debe poner su teléfono (con prefijo, p. ej.
> `+34600111222`) en **Mi perfil** dentro de la app, para recibir los avisos.

> 🔌 **Requisito de red:** el compose conecta Amonn a la red docker de tu
> Gateway (`openwa-network`) y le habla por el nombre del contenedor
> (`http://openwa-api:2785`). Si tu Gateway usa otra red, ajústalo en la
> sección `networks:` del compose.

---

# 🧑‍💻 Método por SSH (alternativa para expertos)

```bash
ssh tu-usuario@IP-DEL-NAS
cd /volume1/docker            # o tu carpeta compartida
git clone https://github.com/elpollo619/Amonn-ToDo.git
cd Amonn-ToDo
cp .env.example .env
nano .env                     # contraseñas + datos de tu OpenWA Gateway
docker compose up -d          # construye y arranca (db + server)
```

Luego abre `http://IP-DEL-NAS:8080` y añade el webhook en el panel del Gateway
(Paso 4).

---

## Mantenimiento

| Acción | Método gráfico | Por SSH |
|---|---|---|
| Ver estado | Docker → Container | `docker compose ps` |
| Ver logs | Container → Protokolle | `docker compose logs -f server` |
| Parar | Projekt → Detener | `docker compose down` |
| Actualizar | Ver **Actualizar a una versión nueva** más abajo (etiqueta `sha-…`) | `git pull && docker compose up -d --build` |
| Copia de seguridad | copia la carpeta `data/` | copia la carpeta `data/` |

---

## 🔄 Actualizar a una versión nueva (importante en UGOS)

UGOS **no vuelve a descargar** una etiqueta que ya tiene en caché, así que
`latest` puede quedarse con una versión vieja aunque recrees el proyecto. Para
actualizar, fija siempre la **etiqueta exacta** de la versión nueva:

1. Mira la última etiqueta `sha-XXXXXXX` en
   `https://github.com/elpollo619/Amonn-ToDo/pkgs/container/amonn-todo`.
2. En el compose del proyecto cambia la línea de la imagen a
   `image: ghcr.io/elpollo619/amonn-todo:sha-XXXXXXX`.
3. **Borra el proyecto (sin borrar la carpeta `data/`) y créalo de nuevo** con
   ese compose. Editar y "Arrancar" no aplica cambios de imagen.

### Comprobar qué versión corre el NAS (sin adivinar)

En el navegador (o con `curl`):
```
http://IP-DEL-NAS:8080/api/version   → {"version":"XXXXXXX", ...}
http://IP-DEL-NAS:8080/api/health    → {"ok":true}
```
Si `version` no coincide con la etiqueta que pusiste, el NAS no cogió la imagen
nueva: repite el paso 3. En el contenedor, **Info → Versionsnummer** también
muestra la etiqueta.

> 💡 La app se abre por `http://IP` (conexión no segura). Es normal en la red
> local; por eso la web incluye un respaldo para funciones que solo existen en
> https (como `crypto.randomUUID`).

---

## ⚠️ Aviso sobre WhatsApp (OpenWA Gateway)

El OpenWA Gateway usa WhatsApp de forma **no oficial** (motor Baileys, como
WhatsApp Web). Para una herramienta interna con pocos mensajes suele funcionar
bien, pero WhatsApp **podría bloquear el número** si detecta uso automatizado.
Por eso conviene usar el número de un teléfono que no te importe. Recomendaciones:

- No enviar mensajes masivos ni a desconocidos.
- Mantener un volumen bajo y "humano" de mensajes.
- Como Amonn habla con el Gateway por HTTP estándar, si algún día pasas a otro
  proveedor (incluida la API oficial de Meta) solo habría que adaptar el módulo
  `server/src/whatsapp.js`.

---

## Problemas frecuentes

- **No carga la app** → mira los logs del contenedor `server` y comprueba que
  `db` arrancó.
- **"manifest unknown" o no descarga la imagen** → repite el Paso 1 (la imagen
  debe estar en **Public**), o revisa que el nombre sea
  `ghcr.io/elpollo619/amonn-todo:latest`.
- **No salen los recordatorios** → revisa en los logs de `server` si hay error
  al llamar al Gateway. Comprueba `WA_API_URL` (IP + puerto 2785 correctos),
  `WA_API_KEY`, `WA_SESSION_ID`, que `WA_ENABLED` es `true`, y que las personas
  tienen su teléfono (con prefijo) en **Mi perfil**.
- **No se marcan las tareas al responder SÍ/NO** → mira el `Protokoll` de
  `amonn-server`. Debe poner `[wa] tiempo real conectado`. Si no, revisa que
  Amonn esté en la misma red que el Gateway (`openwa-network`) y que `WA_API_KEY`
  sea correcta. También que la persona tenga su teléfono (con prefijo) en su
  perfil.
