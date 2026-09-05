# Reimportar la Liste Mietvertrag al asistente

La tabla `mietvertraege` es una FOTO de la hoja «Liste aktuell» del Excel
maestro. Cuando la oficina cambie contratos, se reimporta así (desde el Mac
con el Drive montado; ~1 minuto):

```bash
cd server/scripts/importar-liste
python3 extraer_liste.py > /tmp/liste.json     # lee el Excel del Drive
node generar_sql.mjs                            # /tmp/liste.json → /tmp/liste.sql
cat /tmp/liste.sql | ssh -i ~/.ssh/id_ed25519_kali Cris@100.77.9.60 \
  "docker exec -i amonn-db-1 psql -U amonn -d amonn -q"
```

Notas:
- `extraer_liste.py` lleva la ruta del Excel dentro (Drive elpollotue).
  Cuando la copia a «10 Immobilien» sea la definitiva, actualizarla ahí.
- El SQL borra y recarga la tabla entera (es una foto, no un histórico).
- Los scripts esperan `/tmp/liste.json` y `/tmp/liste.sql`; ajustar dentro
  si hace falta.
