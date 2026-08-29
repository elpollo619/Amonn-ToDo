import { useMemo, useState } from 'react'
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { es } from 'date-fns/locale'
import { useData } from '../context/DataContext'
import { TaskModal } from '../components/TaskModal'
import type { Task } from '../lib/types'
import './Calendar.css'

const PRIORITY_COLOR: Record<string, string> = {
  high: '#ef4444',
  medium: '#0ea5e9',
  low: '#9aa0b4',
}

function toKey(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

export function Calendar() {
  const { tasks } = useData()
  const [cursor, setCursor] = useState(new Date())
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

  function openDay(date: Date) {
    setEditingTask(null)
    setPresetDate(toKey(date))
    setModalOpen(true)
  }
  function openTask(e: React.MouseEvent, task: Task) {
    e.stopPropagation()
    setEditingTask(task)
    setPresetDate(null)
    setModalOpen(true)
  }

  const weekdays = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Calendario</h1>
          <div className="subtitle">
            Tareas planificadas por fecha. Haz clic en un día para añadir una.
          </div>
        </div>
        <div className="cal-nav">
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setCursor((c) => addMonths(c, -1))}
          >
            ‹
          </button>
          <span className="month">
            {format(cursor, 'MMMM yyyy', { locale: es })}
          </span>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setCursor((c) => addMonths(c, 1))}
          >
            ›
          </button>
          <button className="btn btn-sm" onClick={() => setCursor(new Date())}>
            Hoy
          </button>
        </div>
      </div>

      <div className="calendar">
        <div className="cal-weekdays">
          {weekdays.map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <div className="cal-grid">
          {days.map((day) => {
            const key = toKey(day)
            const dayTasks = tasksByDay.get(key) ?? []
            const otherMonth = !isSameMonth(day, cursor)
            return (
              <div
                key={key}
                className={
                  'cal-cell' +
                  (otherMonth ? ' other-month' : '') +
                  (isToday(day) ? ' today' : '')
                }
                onClick={() => openDay(day)}
              >
                <span className="cal-daynum">{format(day, 'd')}</span>
                {dayTasks.slice(0, 3).map((t) => (
                  <span
                    key={t.id}
                    className={'cal-pill' + (t.status === 'done' ? ' done' : '')}
                    style={{ background: PRIORITY_COLOR[t.priority] }}
                    onClick={(e) => openTask(e, t)}
                    title={t.title}
                  >
                    {t.title}
                  </span>
                ))}
                {dayTasks.length > 3 && (
                  <span className="cal-more">+{dayTasks.length - 3} más</span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {modalOpen && (
        <TaskModal
          task={editingTask}
          defaultDate={presetDate}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  )
}
