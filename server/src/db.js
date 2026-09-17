import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { config } from './config.js'

const { Pool } = pg
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Devolver las columnas DATE (OID 1082) tal cual ("YYYY-MM-DD"), sin
// convertirlas a Date/ISO, que es lo que espera el frontend (calendario).
pg.types.setTypeParser(1082, (value) => value)

export const pool = new Pool({ connectionString: config.databaseUrl })

export function query(text, params) {
  return pool.query(text, params)
}

/** Aplica el esquema (idempotente) y espera a que Postgres esté disponible. */
export async function initDb() {
  const schema = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8')
  const maxAttempts = 30
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await pool.query(schema)
      console.log('[db] Esquema aplicado correctamente')
      return
    } catch (err) {
      if (attempt === maxAttempts) throw err
      console.log(
        `[db] Postgres no está listo (intento ${attempt}/${maxAttempts}): ${err.code ?? err.message}`,
      )
      await new Promise((r) => setTimeout(r, 2000))
    }
  }
}
