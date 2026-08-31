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
5. **Cambia las líneas marcadas con 🔴** (contraseñas inventadas + datos de tu
   OpenWA Gateway):
   - `DB_PASSWORD` / `DATABASE_URL`: la contraseña de la base de datos (aparece
     **dos veces**, debe coincidir),
   - `JWT_SECRET`: una frase larga y aleatoria,
   - `WA_API_URL`: `http://IP-DE-TU-NAS:2785` (la IP de tu NAS + el puerto del
     Gateway),
   - `WA_API_KEY`: la clave de tu Gateway (la ves en su panel, puerto 2785, o en
     `data/.api-key`),
   - `WA_SESSION_ID`: el id de tu sesión de WhatsApp en el Gateway (lo ves en su
     panel, o en `GET /api/sessions`),
   - `WA_WEBHOOK_SECRET`: un texto secreto que inventes (lo usarás también en el
     Paso 4).
6. Dale a **Crear / Arrancar**. La primera vez tarda un par de minutos en
   descargar. Cuando termine verás 2 contenedores: `db` y `server`.

## Paso 3 — Abrir la app

En el navegador:

```
http://IP-DE-TU-NAS:8080
```

Regístrate con tu email, crea tu equipo y empieza a añadir tareas. 🎉

## Paso 4 — Conectar tu OpenWA Gateway (webhook para las respuestas)

Amonn **reutiliza tu OpenWA Gateway** que ya está vinculado a WhatsApp, así que
**no hay que escanear ningún QR**. Solo falta decirle al Gateway que envíe las
respuestas entrantes a Amonn:

1. Abre el **panel de tu OpenWA Gateway** (`http://IP-DE-TU-NAS:2785`).
2. Ve a **Webhooks** (o *Sessions → tu sesión → Webhooks*) y **añade uno nuevo**:
   - **URL:** `http://IP-DE-TU-NAS:8080/api/whatsapp/webhook`
   - **Evento:** `message.received`
   - **Secret:** el mismo texto que pusiste en `WA_WEBHOOK_SECRET`.
3. Guarda. Puedes usar el botón **Test** del webhook para comprobar que llega.

Ahora el flujo está completo: Amonn envía los recordatorios por tu Gateway, y
cuando alguien responde **SÍ/NO**, el Gateway se lo reenvía a Amonn y la tarea se
actualiza sola. ✅

> 💡 Cada persona del equipo debe poner su teléfono (con prefijo, p. ej.
> `+34600111222`) en **Mi perfil** dentro de la app, para recibir los avisos.

> 🔌 **Sobre la conexión entre contenedores:** el ejemplo usa la IP de tu NAS
> (`http://IP-DE-TU-NAS:2785`), lo más sencillo. Si prefieres que se comuniquen
> por nombre de contenedor (`http://openwa-api:2785`), añade el proyecto de
> Amonn a la misma red docker que tu Gateway.

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
| Actualizar | Projekt → recrear (baja la imagen `:latest` nueva) | `git pull && docker compose up -d --build` |
| Copia de seguridad | copia la carpeta `data/` | copia la carpeta `data/` |

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
- **No se marcan las tareas al responder SÍ/NO** → el webhook del Gateway no
  está llegando. Revisa en el panel del Gateway que la URL del webhook es
  `http://IP-DE-TU-NAS:8080/api/whatsapp/webhook`, el evento `message.received`,
  y que el **secret** coincide con `WA_WEBHOOK_SECRET`. Usa el botón **Test**.
- **Respuestas rechazadas (401 en los logs)** → el `secret` del webhook y
  `WA_WEBHOOK_SECRET` no coinciden.
