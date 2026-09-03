import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import * as api from '../lib/api'
import { subscribeTasks } from '../lib/api'
import { useAuth } from './AuthContext'
import type { Profile, Task, TaskInput, TaskState } from '../lib/types'

interface DataState {
  tasks: Task[]
  profiles: Profile[]
  states: TaskState[]
  loading: boolean
  error: string | null
  reload: () => Promise<void>
  addTask: (input: TaskInput) => Promise<void>
  editTask: (id: string, patch: Partial<Task>) => Promise<void>
  removeTask: (id: string) => Promise<void>
  profileById: (id: string | null) => Profile | undefined
}

const DataContext = createContext<DataState | undefined>(undefined)

export function DataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [tasks, setTasks] = useState<Task[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [states, setStates] = useState<TaskState[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      setError(null)
      const [t, p, e] = await Promise.all([api.listTasks(), api.listProfiles(), api.listStates()])
      setTasks(t)
      setProfiles(p)
      setStates(e)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar datos')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    reload()
    const unsub = subscribeTasks(() => reload())
    return unsub
  }, [reload])

  const value: DataState = {
    tasks,
    profiles,
    states,
    loading,
    error,
    reload,
    async addTask(input) {
      const created = await api.createTask(input, user?.id ?? null)
      setTasks((prev) => [created, ...prev])
    },
    async editTask(id, patch) {
      const updated = await api.updateTask(id, patch)
      setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)))
    },
    async removeTask(id) {
      await api.deleteTask(id)
      setTasks((prev) => prev.filter((t) => t.id !== id))
    },
    profileById(id) {
      if (!id) return undefined
      return profiles.find((p) => p.id === id)
    },
  }

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useData(): DataState {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData debe usarse dentro de <DataProvider>')
  return ctx
}
