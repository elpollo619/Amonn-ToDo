# Amonn — App web (frontend)

React + Vite + TypeScript. Habla con el backend de `../server` a través de
`/api` (misma URL en producción, con proxy en desarrollo).

## Scripts

```bash
npm install
npm run dev      # http://localhost:5173 (proxy de /api a localhost:4000)
npm run build    # compila a dist/
npm run preview  # sirve la versión compilada
npm run lint     # análisis estático (oxlint)
```

## Configuración (`.env`, opcional)

```
# Modo demostración: datos locales de ejemplo, sin backend.
VITE_DEMO=true
# URL del backend si NO es el mismo origen (normalmente se deja vacío).
VITE_API_URL=
```

En producción (servido por el contenedor del servidor) no hace falta `.env`:
la app llama a `/api` en el mismo origen.

## Mapa del código

```
src/
├── lib/
│   ├── apiClient.ts   Cliente HTTP + token de sesión + URL de eventos (SSE)
│   ├── api.ts         API unificada (backend ⇄ demo)
│   ├── demo.ts        Almacén local de demostración
│   ├── types.ts       Tipos de dominio (Task, Profile…)
│   └── constants.ts   Etiquetas y colores
├── context/
│   ├── AuthContext.tsx   Sesión y login del equipo
│   └── DataContext.tsx   Tareas + equipo, tiempo real (SSE) y acciones
├── components/           Avatar, insignias, tarjeta y modal de tarea, layout
└── pages/                Login, Tablero, Calendario, Equipo, Perfil
```
