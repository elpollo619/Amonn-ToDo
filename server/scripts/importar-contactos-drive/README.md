# Importar los contactos de obra desde el Drive

Lee las **dos** listas de contactos del Google Drive y las mete en la tabla
`contacts` del asistente, **separadas por proyecto**:

- `Adressliste.xlsx` — una hoja por proyecto (G60 Muri, I16 Gampelen,
  770 Bremgarten, SWE A4, B4).
- `Kontaktliste_770lds_Seewer.xlsx` — hoja «Kontakte» del proyecto 770.

Los dos «770» se unifican bajo un mismo proyecto: **770 Bremgarten (Seewer)**.

## Cómo se ejecuta (desde el Mac con el Drive montado; ~1 minuto)

```bash
cd server/scripts/importar-contactos-drive
python3 extraer_contactos.py > /tmp/contactos.json     # lee los dos Excel del Drive
node   generar_sql_contactos.mjs                       # /tmp/contactos.json → /tmp/contactos_sql.sql
cat /tmp/contactos_sql.sql | ssh -i ~/.ssh/id_ed25519_kali Cris@100.77.9.60 \
  "docker exec -i amonn-db-1 psql -U amonn -d amonn -q"
```

Para probar en **local** antes de tocar producción:

```bash
psql "postgres://amonn:amonn@localhost:5432/amonn" -f /tmp/contactos_sql.sql
```

## Notas

- **Idempotente**: inserta un contacto solo si no existe ya uno con el mismo
  nombre en el mismo proyecto. Se puede correr varias veces sin duplicar.
- **Casi-duplicados**: el extractor descarta las filas «solo empresa»
  (nombre == empresa) cuando ya hay una persona real de esa empresa en el
  mismo proyecto (pasa cuando una empresa sale en las dos listas).
- **Solo lectura del Excel**: NO se escribe en los originales del Drive; la
  app pasa a ser la fuente. Exportar cuando haga falta.
- Las rutas del Drive (`elpollotue`) van dentro de `extraer_contactos.py`.
