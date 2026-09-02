import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

type Kind = 'success' | 'error' | 'info'
interface Toast { id: number; text: string; kind: Kind }
interface ToastApi { show: (text: string, kind?: Kind) => void }

const ToastContext = createContext<ToastApi | undefined>(undefined)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([])
  const show = useCallback((text: string, kind: Kind = 'info') => {
    const id = Date.now() + Math.random()
    setItems((prev) => [...prev, { id, text, kind }])
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 3200)
  }, [])
  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>{t.text}</div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast debe usarse dentro de <ToastProvider>')
  return ctx
}
