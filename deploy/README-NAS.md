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
5. **Cambia las 4 líneas marcadas con 🔴** (invéntate contraseñas largas):
   - la contraseña de la base de datos (aparece **dos veces**, debe coincidir),
   - el secreto `JWT_SECRET`,
   - la clave de WhatsApp `WA_API_KEY` (aparece **dos veces**, debe coincidir).
6. Dale a **Crear / Arrancar**. La primera vez tarda un par de minutos en
   descargar. Cuando termine verás 3 contenedores: `db`, `server`, `waautomate`.

## Paso 3 — Abrir la app

En el navegador:

```
http://IP-DE-TU-NAS:8080
```

Regístrate con tu email, crea tu equipo y empieza a añadir tareas. 🎉

## Paso 4 — Conectar WhatsApp (escanear el QR)

1. En la app **Docker** → **Container** → abre el contenedor **waautomate** →
   **Protokolle / Logs**.
2. Verás un **código QR** dibujado. En el **teléfono que no usas**:
   **WhatsApp → Ajustes → Dispositivos vinculados → Vincular un dispositivo**, y
   escanea el QR.
3. La sesión queda guardada en `data/wa-session`; **no tendrás que repetirlo**
   aunque reinicies el NAS.

> 💡 Cada persona del equipo debe poner su teléfono (con prefijo, p. ej.
> `+34600111222`) en **Mi perfil** dentro de la app, para recibir los avisos.

---

# 🧑‍💻 Método por SSH (alternativa para expertos)

```bash
ssh tu-usuario@IP-DEL-NAS
cd /volume1/docker            # o tu carpeta compartida
git clone https://github.com/elpollo619/Amonn-ToDo.git
cd Amonn-ToDo
cp .env.example .env
nano .env                     # cambia contraseñas
docker compose up -d          # construye y arranca (db + server + waautomate)
```

Luego abre `http://IP-DEL-NAS:8080` y escanea el QR con
`docker compose logs -f waautomate`.

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

## ⚠️ Aviso sobre WhatsApp (OpenWA)

OpenWA usa WhatsApp de forma **no oficial** (automatiza WhatsApp Web). Para una
herramienta interna con pocos mensajes suele funcionar bien, pero WhatsApp
**podría bloquear el número** si detecta uso automatizado. Por eso usamos el
número del teléfono que no te importa. Recomendaciones:

- No enviar mensajes masivos ni a desconocidos.
- Mantener un volumen bajo y "humano" de mensajes.
- Si algún día quieres la vía 100% oficial (sin riesgo), se puede cambiar a la
  API oficial de Meta/Twilio; el código está preparado para ello.

---

## Problemas frecuentes

- **No carga la app** → mira los logs del contenedor `server` y comprueba que
  `db` arrancó.
- **El QR no aparece** → abre los logs de `waautomate` y espera; si falla por
  memoria, asegúrate de que el NAS tiene RAM libre (WhatsApp usa ~1 GB).
- **"manifest unknown" o no descarga la imagen** → repite el Paso 1 (la imagen
  debe estar en **Public**), o revisa que el nombre sea
  `ghcr.io/elpollo619/amonn-todo:latest`.
- **La sesión de WhatsApp se pierde al reiniciar** → comprueba que existe la
  carpeta `data/wa-session` y no está vacía.
- **No llegan los recordatorios** → confirma que las personas tienen su teléfono
  en el perfil (con prefijo) y que `WA_ENABLED` es `true`.
