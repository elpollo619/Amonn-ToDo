# Amonn — App web

Frontend de Amonn: React + Vite + TypeScript.

## Desarrollo

```bash
npm install
npm run dev      # arranca en http://localhost:5173
npm run build    # compila a dist/
npm run preview  # sirve la versión compilada
npm run lint     # análisis estático (oxlint)
```

## Configuración

Copia `.env.example` a `.env` y rellena las claves de Supabase para conectar
con la nube. Sin `.env`, la app funciona en **modo demo** (datos locales).

```
VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

## Mapa del código

```
src/
├── lib/
│   ├── supabase.ts    Cliente de Supabase (o null en modo demo)
│   ├── api.ts         API unificada (Supabase ⇄ demo)
│   ├── demo.ts        Almacén local de demostración
│   ├── types.ts       Tipos de dominio (Task, Profile…)
│   └── constants.ts   Etiquetas y colores
├── context/
│   ├── AuthContext.tsx   Sesión y login del equipo
│   └── DataContext.tsx   Tareas + equipo, tiempo real y acciones
├── components/           Avatar, insignias, tarjeta y modal de tarea, layout
└── pages/                Login, Tablero, Calendario, Equipo, Perfil
```

## Despliegue

Es una web estática (`dist/`). Puedes publicarla en Vercel, Netlify, Cloudflare
Pages o cualquier hosting estático. Recuerda definir las variables
`VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` en el panel del proveedor.
