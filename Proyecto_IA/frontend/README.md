# SAM-3 LOD1 Frontend

Frontend React (Vite + TypeScript) para consumir el backend FastAPI de clasificación (LOD1). Incluye vistas para monitorear la salud del sistema, registrar datasets, gestionar conceptos, lanzar jobs de nivel 1, monitorizarlos y explorar estadísticas/samples.

## Requisitos
- Node.js 18+
- npm

## Configuración
1. Copia el archivo de entorno y ajusta la URL base del backend:
   ```bash
   cp .env.example .env
   # edita .env y define VITE_API_BASE_URL (por ejemplo http://localhost:8000)
   ```

2. Instala dependencias:
   ```bash
   npm install
   ```

3. Ejecuta el servidor de desarrollo:
   ```bash
   npm run dev
   ```

El `vite.config.ts` incluye un proxy opcional para rutas `/api` si `VITE_API_BASE_URL` está definido. Si el backend no permite CORS, usa el proxy de Vite en desarrollo.

## Scripts
- `npm run dev`: inicia el servidor de desarrollo.
- `npm run build`: genera la versión optimizada de producción.
- `npm run preview`: sirve la build generada.
- `npm run lint`: ejecuta ESLint.

## Estructura
```
src/
  api/          # cliente axios y funciones de endpoints
  components/   # componentes reutilizables (tablas, banners, badges, etc.)
  config/       # configuración de entorno
  hooks/        # hooks de polling (health, job)
  pages/        # rutas principales
  types/        # definiciones TypeScript
```

## Consideraciones de uso
- Todas las imágenes se cargan vía HTTP desde el backend (`/api/v1/images/{id}` o `image_url`).
- La UI maneja listas vacías y campos opcionales sin romperse.
- El polling se detiene en estados terminales y mantiene el progreso máximo conocido.
- Usa `@tanstack/react-query` para caching/polling y axios con timeouts configurados.
