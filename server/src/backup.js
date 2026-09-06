// ============================================================
// Copia de seguridad nocturna de la base, a las 03:30.
//
// Todo lo que el asistente sabe (contratos, facturas, gastos, permisos…)
// vive en el Postgres del NAS y hasta hoy no tenía copia. El contenedor no
// trae pg_dump, así que el volcado es propio: cada tabla a JSON, todo en
// un .json.gz dentro de uploads/backups/ (el volumen que sobrevive a los
// redespliegues). Se conservan los últimos 14. No es un pg_dump — para
// restaurar se reinsertan las filas — pero es la diferencia entre perder
// una noche y perderlo todo.
// ============================================================
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import cron from 'node-cron'
import { config } from './config.js'
import { query } from './db.js'

const TABLAS = [
  'users', 'tasks', 'subtasks', 'comments', 'task_states', 'aliases',
  'appointments', 'contacts', 'shopping_items', 'expenses', 'expense_exports',
  'absences', 'meter_readings', 'mietvertraege', 'qr_bills', 'bank_entries',
  'permissions', 'app_state', 'seen_mails', 'seen_guest_messages',
]

export async function volcarBackup(dir = null) {
  const destino = dir ?? (config.uploadDir ? path.join(config.uploadDir, 'backups') : null)
  if (!destino) return { ok: false, motivo: 'sin UPLOAD_DIR' }
  fs.mkdirSync(destino, { recursive: true })

  const dump = { creado: new Date().toISOString(), tablas: {} }
  for (const tabla of TABLAS) {
    try {
      // Los PDF (bytea) engordarían el fichero: se guardan aparte del json.
      const cols = tabla === 'qr_bills'
        ? 'id, token, amount_cents, debtor, message, reference, paid_at, created_at'
        : '*'
      const { rows } = await query(`select ${cols} from ${tabla}`)
      dump.tablas[tabla] = rows
    } catch (err) {
      dump.tablas[tabla] = { error: err.message }
    }
  }
  const nombre = `amonn-${new Date().toISOString().slice(0, 10)}.json.gz`
  fs.writeFileSync(path.join(destino, nombre), zlib.gzipSync(JSON.stringify(dump)))

  // Conservar los 14 más recientes.
  const viejos = fs.readdirSync(destino).filter((f) => f.startsWith('amonn-')).sort().slice(0, -14)
  for (const f of viejos) fs.unlinkSync(path.join(destino, f))

  const filas = Object.values(dump.tablas).reduce((n, t) => n + (Array.isArray(t) ? t.length : 0), 0)
  console.log(`[backup] ${nombre}: ${filas} filas de ${TABLAS.length} tablas`)
  return { ok: true, fichero: nombre, filas }
}

export function scheduleBackup() {
  if (!config.uploadDir) {
    console.log('[backup] sin UPLOAD_DIR: copia nocturna apagada')
    return
  }
  cron.schedule('30 3 * * *', () => {
    volcarBackup().catch((e) => console.error('[backup]', e.message))
  }, { timezone: config.timezone })
  console.log('[backup] copia nocturna a las 03:30 (14 días de retención)')
}
