import { useMemo, useState, type MouseEvent } from 'react'
import {
  addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, isToday,
  startOfMonth, startOfWeek,
} from 'date-fns'
import { es } from 'date-fns/locale'
import { useData } from '../context/DataContext'
import { TaskModal } from '../components/TaskModal'
import { Avatar } from '../components/Avatar'
import { PriorityBadge, StatusBadge } from '../components/Badges'
import { IconCheck, IconChevronLeft, IconChevronRight, IconPlus } from '../components/Icons'
import { parseDay, todayKey } from '../lib/dates'
import type { Task } from '../lib/types'
import './Calendar.css'

const PRIORITY_COLOR: Record<string, string> = { high: '#dc2626', medium: '#0284c7', low: '#9aa1b4' }

function toKey(date: Date): string { return format(date, 'yyyy-MM-dd') }

export function Calendar() {
  const { tasks, profileById, editTask } = useData()
  const [cursor, setCursor] = useState(new Date())
  const [selected, setSelected] = useState<string>(todayKey())
  const [modalOpen, setModalOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [presetDate, setPresetDate] = useState<string | null>(null)

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 })
    const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 })
    return eachDayOfInterval({ start, end })
  }, [cursor])

  const tasksByDay = useMemo(() => {
    const map = new Map<string, Task[]>()
    for (const t of tasks) {
      if (!t.due_date) continue
      const list = map.get(t.due_date) ?? []
      list.push(t)
      map.set(t.due_date, list)
    }
    return map
  }, [tasks])

  const selectedTasks = tasksByDay.get(selected) ?? []
  const selectedDate = parseDay(selected)
  const rawDay = format(selectedDate, "EEEE d 'de' MMMM", { locale: es })
  const selectedLabel = rawDay.charAt(0).toUpperCase() + rawDay.slice(1)

  function openNewOn(dateKey: string) { setEditingTask(null); setPresetDate(dateKey); setModalOpen(true) }
  function openTask(e: MouseEvent, task: Task) {
    e.stopPropagation(); setEditingTask(task); setPresetDate(null); setModalOpen(true)
  }
  function goToday() { const t = new Date(); setCursor(t); setSelected(toKey(t)) }

  const weekdays = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
  const weekdaysLong = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Calendario</h1>
          <div className="subtitle">Toca un día para ver sus tareas o añadir una.</div>
        </div>
      </div>

      <div className="cal-nav">
        <button className="btn btn-icon" onClick={() => setCursor((c) => addMonths(c, -1))} aria-label="Mes anterior">
          <IconChevronLeft />
        </button>
        <span className="month">{format(cursor, 'MMMM yyyy', { locale: es })}</span>
        <button className="btn btn-icon" onClick={() => setCursor((c) => addMonths(c, 1))} aria-label="Mes siguiente">
          <IconChevronRight />
        </button>
        <button className="btn btn-sm" onClick={goToday}>Hoy</button>
      </div>

      <div className="calendar">
        <div className="cal-weekdays">
          {weekdays.map((d, i) => (
            <span key={d}><span className="short">{d}</span><span className="long">{weekdaysLong[i]}</span></span>
          ))}
        </div>
        <div className="cal-grid">
          {days.map((day) => {
            const key = toKey(day)
            const dayTasks = tasksByDay.get(key) ?? []
            const pending = dayTasks.filter((t) => t.status !== 'done')
            const otherMonth = !isSameMonth(day, cursor)
            return (
              <div
                key={key}
                className={
                  'cal-cell' + (otherMonth ? ' other-month' : '') + (isToday(day) ? ' today' : '') +
                  (selected === key ? ' selected' : '')
                }
                onClick={() => setSelected(key)}
                onDoubleClick={() => openNewOn(key)}
              >
                <span className="cal-daynum">{format(day, 'd')}</span>
                <div className="cal-dots">
                  {dayTasks.slice(0, 4).map((t) => (
                    <span key={t.id} className={'cal-dot' + (t.status === 'done' ? ' done' : '')}
                      style={{ background: PRIORITY_COLOR[t.priority] }} />
                  ))}
                </div>
                <div className="cal-pills">
                  {dayTasks.slice(0, 3).map((t) => (
                    <span key={t.id} className={'cal-pill' + (t.status === 'done' ? ' done' : '')}
                      style={{ background: PRIORITY_COLOR[t.priority] }}
                      onClick={(e) => openTask(e, t)} title={t.title}>
                      {t.title}
                    </span>
                  ))}
                  {dayTasks.length > 3 && <span className="cal-more">+{dayTasks.length - 3} más</span>}
                </div>
                {pending.length > 0 && <span className="cal-count">{pending.length}</span>}
              </div>
            )
          })}
        </div>
      </div>

      <section className="agenda">
        <div className="agenda-head">
          <div>
            <div className="agenda-day">{selectedLabel}</div>
            <div className="muted" style={{ fontSize: 13 }}>
              {selectedTasks.length === 0 ? 'Sin tareas este día' : `${selectedTasks.length} tarea${selectedTasks.length === 1 ? '' : 's'}`}
            </div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => openNewOn(selected)}>
            <IconPlus size={16} /> Añadir
          </button>
        </div>
        {selectedTasks.map((t) => {
          const who = profileById(t.assignee_id)
          const done = t.status === 'done'
          return (
            <div key={t.id} className={'agenda-item' + (done ? ' done' : '')} onClick={(e) => openTask(e, t)}>
              <button className={'check' + (done ? ' checked' : '')}
                onClick={(e) => { e.stopPropagation(); editTask(t.id, { status: done ? 'open' : 'done' }) }}
                aria-label={done ? 'Marcar como abierta' : 'Marcar como completada'}>
                <IconCheck />
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="agenda-title truncate">{t.title}</div>
                <div className="row" style={{ marginTop: 6, flexWrap: 'wrap' }}>
                  <span className="row" style={{ fontSize: 12.5, color: 'var(--text-soft)', fontWeight: 600 }}>
                    <Avatar profile={who} size={18} /> {who?.full_name?.split(' ')[0] ?? 'Sin asignar'}
                  </span>
                  <PriorityBadge priority={t.priority} />
                  <StatusBadge status={t.status} />
                </div>
              </div>
            </div>
          )
        })}
      </section>

      {modalOpen && (
        <TaskModal task={editingTask} defaultDate={presetDate} onClose={() => setModalOpen(false)} />
      )}
    </>
  )
}
