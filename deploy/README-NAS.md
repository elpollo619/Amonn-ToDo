# 🏠 Instalar Amonn en tu NAS Ugreen (paso a paso)

Guía para dejar **todo** funcionando en tu **Ugreen NASync DH4300 Plus**
(UGOS Pro): la app, la base de datos y el agente de WhatsApp. Los datos se
guardan en la carpeta `data/` del NAS y **nunca salen de tu casa**.

> ⏱️ Tiempo estimado: 20–30 min. No necesitas ser programador; solo copiar,
> pegar y escanear un QR.

---

## 0. Antes de empezar

Necesitas:
- Tu **NAS Ugreen** encendido y en tu red.
- El **teléfono que no usas** con su número activo (para WhatsApp).
- 10 minutos de paciencia 🙂

---

## 1. Activar Docker y SSH en el NAS

1. Abre **UGOS Pro** en el navegador (la interfaz de tu NAS).
2. En el **App Center**, instala **Docker** (a veces llamado "Contenedores").
3. Ve a **Panel de control → Terminal / SSH** y **activa SSH**.

---

## 2. Copiar Amonn al NAS

Tienes dos opciones:

**Opción A — con Git (recomendada):** conéctate por SSH al NAS y clona el
proyecto:

```bash
ssh tu-usuario@IP-DEL-NAS
cd /volume1/docker          # o la carpeta compartida que uses
git clone https://github.com/elpollo619/Amonn-ToDo.git
cd Amonn-ToDo
```

**Opción B — sin Git:** descarga el proyecto como ZIP desde GitHub, descomprímelo
y cópialo a una carpeta del NAS (p. ej. `docker/Amonn-ToDo`) con el explorador
de archivos de UGOS.

---

## 3. Configurar tus contraseñas

Copia el archivo de ejemplo y edítalo con tus valores:

```bash
cp .env.example .env
nano .env      # (o edítalo con el editor de texto de UGOS)
```

Cambia al menos estos valores por otros tuyos (inventados, largos):

```
DB_PASSWORD=...            # contraseña de la base de datos
JWT_SECRET=...             # una frase larga y aleatoria
WA_API_KEY=...             # una clave secreta para WhatsApp
APP_PORT=8080             # el puerto donde verás la app
```

Guarda y cierra.

---

## 4. Arrancar todo

Desde la carpeta del proyecto:

```bash
docker compose up -d
```

La primera vez tarda unos minutos (descarga y construye las imágenes). Cuando
termine, tendrás 3 contenedores en marcha: `db`, `server` y `waautomate`.

Abre la app en el navegador:

```
http://IP-DEL-NAS:8080
```

🎉 Regístrate con tu email, crea tu equipo y empieza a añadir tareas.

---

## 5. Conectar WhatsApp (escanear el QR)

El contenedor `waautomate` es el agente de WhatsApp. Para vincular tu número,
mira su registro (log) para ver el **código QR**:

```bash
docker compose logs -f waautomate
```

Verás un QR dibujado en la terminal. En el **teléfono que no usas**:

1. Abre **WhatsApp → Ajustes → Dispositivos vinculados**.
2. **Vincular un dispositivo** y escanea el QR de la terminal.

Cuando se vincule, el log dirá que la sesión está lista. La sesión queda
guardada en `data/wa-session`, así que **no tendrás que repetir esto** aunque
reinicies el NAS.

> 💡 Cada persona del equipo debe poner su número (con prefijo, p. ej.
> `+34600111222`) en **Mi perfil** dentro de la app, para recibir los avisos.

---

## 6. Probar el agente

- En la app, crea una tarea con **fecha de hoy** y asígnala a alguien que tenga
  su teléfono puesto en el perfil.
- Fuerza un recordatorio de prueba (sin esperar a las 9:00). Desde SSH, entra en
  la app, copia tu token o simplemente espera al cron; o pide a un compañero que
  te escriba al número del bot: responderá según el estado de tus tareas.
- Cuando llegue el recordatorio *"¿Has completado la tarea X?"*, responde **SÍ**
  o **NO** por WhatsApp: la tarea se actualiza sola en la app. ✅

Los recordatorios automáticos salen de lunes a viernes a las 9:00 (lo cambias
en `.env` con `REMINDER_CRON`).

---

## Mantenimiento

| Acción | Comando |
|---|---|
| Ver estado | `docker compose ps` |
| Ver logs | `docker compose logs -f server` |
| Parar todo | `docker compose down` |
| Arrancar de nuevo | `docker compose up -d` |
| Actualizar a la última versión | `git pull && docker compose up -d --build` |
| Copia de seguridad | copia la carpeta `data/` (contiene la base de datos y la sesión de WhatsApp) |

---

## ⚠️ Aviso sobre WhatsApp (OpenWA)

OpenWA usa WhatsApp de forma **no oficial** (automatiza WhatsApp Web). Para una
herramienta interna con pocos mensajes suele funcionar bien, pero WhatsApp
**podría bloquear el número** si detecta uso automatizado. Por eso usamos el
número del teléfono que no te importa. Recomendaciones para reducir el riesgo:

- No enviar mensajes masivos ni a desconocidos.
- Mantener un volumen bajo y "humano" de mensajes.
- Si algún día quieres la vía 100% oficial (sin riesgo de bloqueo), se puede
  cambiar a la API oficial de Meta/Twilio; el código está preparado para ello.

---

## Problemas frecuentes

- **No carga la app** → revisa `docker compose logs server`. ¿La base de datos
  arrancó? (`docker compose ps`).
- **El QR no aparece** → `docker compose logs -f waautomate` y espera; si falla
  por memoria, asegúrate de que el NAS tiene RAM libre (el navegador interno de
  WhatsApp consume ~1 GB).
- **La sesión de WhatsApp se pierde al reiniciar** → comprueba que existe la
  carpeta `data/wa-session` y que no está vacía.
- **No llegan los recordatorios** → confirma que las personas tienen su teléfono
  en el perfil (con prefijo internacional) y que `WA_ENABLED=true`.
