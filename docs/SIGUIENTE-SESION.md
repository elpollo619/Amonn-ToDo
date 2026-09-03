# Empieza por aquí

Instrucciones para Claude Code en una sesión nueva, en el Mac de Cris (misma
red que el NAS). **Cris no es técnico y escribe en español: háblale en
español, un paso cada vez, y haz tú mismo todo lo que puedas por consola.**

## 1. Ponerte en marcha

```bash
git clone https://github.com/elpollo619/Amonn-ToDo
cd Amonn-ToDo
git checkout claude/job-list-app-whatsapp-av9rwl
```

Lee **`docs/HANDOFF.md` entero** antes de tocar nada. Este fichero solo te
dice dónde seguir; el detalle y los gotchas están allí.

## 2. Acceso al NAS (funciona, sin contraseña)

```bash
ssh -i ~/.ssh/id_ed25519_kali Cris@192.168.1.9
```

El usuario `Cris` está en el grupo `docker`: **`docker …` va sin `sudo`**.

- App: `http://192.168.1.9:8080` · versión: `curl -s http://192.168.1.9:8080/api/version`
- Panel del Gateway de WhatsApp: `http://192.168.1.9:2785`
  (⚠️ **sale en blanco** abierto por IP: usa `crypto.randomUUID`, que no existe
  en contexto no seguro. El túnel SSH no vale: el NAS bloquea el reenvío de
  puertos.)
- Compose de Amonn: `/volume1/docker/docker-compose.yaml` — **contiene los
  secretos reales, no lo imprimas ni lo copies al repo.**
  ⚠️ El **servicio** se llama `server`, NO `amonn-server` (ese es el
  `container_name`): `--force-recreate amonn-server` falla con "no such service".
- **Desplegar = `git push`.** CI publica `latest` y Watchtower lo aplica en
  ≤5 min. Solo hay que recrear el proyecto si cambian variables o volúmenes:
  `cd /volume1/docker && docker compose -p amonn -f /volume1/docker/docker-compose.yaml up -d`

## 3. Estado actual (2026-09-03)

Rediseño acordado con Cris: mezcla de las direcciones **A y B** (lienzo:
https://claude.ai/code/artifact/471f85da-75d0-4ea2-806e-1a6f26ae1c1c).
Cinco pasos acordados; **los cinco están hechos y desplegados** salvo un
trozo:

| Paso | Estado |
|---|---|
| 1. Plazos (inicio→fin) + pantalla de inicio nueva | ✅ |
| 2. Estados propios del taller | ✅ |
| 3. Subtareas / pasos | ✅ |
| 4. Línea de tiempo | ✅ |
| 5. Comentarios y fotos | ✅ texto y fotos desde la app · ❌ **fotos entrantes por WhatsApp** |

Antes de eso, en la misma sesión, se arregló el tiempo real de WhatsApp y se
revinculó la sesión (Cris escaneó el QR). El asistente habla **español, alemán
y portugués**, aprende apodos y correcciones, y entiende plazos, estados,
pasos y comentarios por mensaje.

## 4. LO ÚNICO QUE FALTA: probar las fotos con una foto de verdad

Las fotos entrantes **ya están programadas y probadas** (ver el HANDOFF, que
tiene el detalle). Resumen de lo esencial:

- El Gateway **sí manda la foto**: entera, en base64, dentro del propio
  mensaje, en `metadata.media.data`. No busques ficheros; la carpeta `media/`
  está vacía y no importa.
- Si el pie de foto dice la tarea, se pega ahí. Si no, se guarda igual y el
  asistente pregunta a cuál va, con lista numerada.

**Lo que falta es solo comprobarlo en vivo**, porque el código está probado
contra la forma que guarda la base de datos, no contra el evento en directo:

1. Despliega (`git push`; Watchtower lo aplica en ≤5 min).
2. Pide a Cris una foto al +41 76 226 04 47, con y sin pie de foto.
3. Mira que la foto aparece en la tarea dentro de la app.
4. Si no aparece, busca esta línea en `docker logs amonn-server`:
   `[wa] llega algo que parece foto pero sin datos; forma: ...`
   Esa lista de claves dice dónde está realmente la imagen; añade esa ruta al
   array `RUTAS` de `server/src/media.js` y listo.

⚠️ Cris trabaja a veces desde fuera de la oficina y entonces **el NAS no es
alcanzable por SSH** (su casa y la oficina usan el mismo rango 192.168.1.x, así
que ninguna VPN lo arregla). Sí puede entrar por el panel web del NAS. Si hace
falta acceso remoto de verdad, lo que toca es **instalar Tailscale en el NAS**;
Cris ya lo usa en sus otros equipos.

## 5. Pruebas

```bash
cd server && npm test                 # fechas + asistente (sin base de datos)
# con Postgres: DATABASE_URL=… WA_ENABLED=false npm run test:db
cd app && npm test                    # línea de tiempo
cd app && npm run build               # comprueba tipos y compila
```

Para las pruebas con base de datos, levanta un Postgres de usar y tirar:

```bash
export PATH=/opt/homebrew/opt/postgresql@16/bin:$PATH
initdb -D /tmp/pg -U postgres --auth=trust
pg_ctl -D /tmp/pg -o "-p 5433 -k /tmp/pg" -l /tmp/pg/log start
DATABASE_URL="postgres://postgres@127.0.0.1:5433/postgres" WA_ENABLED=false npm run test:db
```

Para ver la app sin credenciales: `cd app && VITE_DEMO=true npm run dev`
(modo demostración, con datos de ejemplo y sin contraseña).

## 6. Trampas que ya han morder una vez

- **`text-transform: capitalize` en español** da "Agosto De 2026". Poner la
  mayúscula inicial en JS. (Ha pasado tres veces.)
- **Regex generadas por script**: revisa que no queden con `\\s` en vez de
  `\s`. Una estuvo rota un paso entero sin que se notara. **Pruébalas siempre
  con una llamada directa después de generarlas.**
- **Formularios anidados**: los componentes de pasos y comentarios viven DENTRO
  del formulario de la tarea. Nada de `<form>` dentro: Enter enviaría el de
  fuera y cerraría el modal.
- **Verbos compartidos en el asistente**: `pon`, `añade` y `anota` sirven para
  crear tareas Y para estados/pasos/comentarios. Las reglas nuevas van antes
  que la de crear pero **exigen** que la cola sea un estado real o que la pista
  señale una tarea existente. Sin eso se malinterpretan.
- **Marcar hecha** debe mover también el estado (clase `done`), o la tarea se
  queda en la columna "Esperando material".
- **Estado y `status` van siempre juntos**: usa `resolveState()` /
  `setTaskState()`, nunca escribas `status` a mano.
- **Aislamiento de los tests con base de datos**: los que reordenan o crean
  estados deben restablecerlos en la preparación, o la pasada siguiente falla.
