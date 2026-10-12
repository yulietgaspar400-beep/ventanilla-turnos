# Ventanilla

Sistema inicial de atención por turnos: API Python (FastAPI) e interfaz Angular. Para desarrollo local usa SQLite; en Vercel usa PostgreSQL mediante `DATABASE_URL`.

## Funciones
- Registro de solicitudes de turno por cliente y servicio.
- Asignación de folio consecutivo diario.
- Llamar al siguiente turno pendiente y marcarlo como atendido.
- Tablero básico y consultas de turnos de los últimos cuatro meses.
- API con CORS habilitado para Angular local.

> MVP de referencia. No es un producto de BBVA ni incluye integración con sistemas bancarios, autenticación, kioscos, pantallas públicas o manejo de datos reales. Para uso real, agregar controles de acceso, auditoría, protección de datos y despliegue seguro.

## Ejecutar localmente
```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r ..\requirements.txt
uvicorn app.main:app --reload
```
API: http://localhost:8000 · Documentación: http://localhost:8000/docs. En otra terminal:

```powershell
cd frontend
npm install
npm start
```
Abrir http://localhost:4200. El proxy local conecta `/api` con FastAPI.

## Publicar desde GitHub en Vercel

1. Sube la carpeta `outputs` a un repositorio de GitHub (puede ser el contenido raíz del repositorio).
2. En Vercel, selecciona **Add New → Project** e importa ese repositorio.
3. Si subiste `outputs` como subcarpeta, configura **Root Directory** como `outputs`. Si el contenido de `outputs` es la raíz del repositorio, deja Root Directory como `./`.
4. Vercel leerá `vercel.json`: el comando de build instala y compila Angular; `/api/*` se dirige a FastAPI.
5. En Vercel, abre **Storage → Marketplace** y crea/conecta una base PostgreSQL (por ejemplo Neon o Supabase). Agrega su cadena de conexión como variable de entorno `DATABASE_URL`, para Production y Preview. Usa la URL de conexión con SSL.
6. Haz deploy. Las siguientes actualizaciones del repositorio conectado dispararán nuevos despliegues automáticamente.

La aplicación crea la tabla al iniciar la API. La base de datos PostgreSQL debe ser accesible desde las funciones de Vercel.

## Endpoints principales
- `POST /api/turnos` crear turno (`nombre`, `servicio`).
- `GET /api/turnos?months=4` historial reciente.
- `GET /api/turnos/next` siguiente turno pendiente.
- `POST /api/turnos/{id}/call` llamar turno.
- `POST /api/turnos/{id}/complete` marcar atendido.
- `GET /api/dashboard` resumen y siguiente turno.

## Configuración importante

- `DATABASE_URL`: obligatorio en Vercel para que los turnos persistan; no guardes su valor en GitHub.
- La base local SQLite (`backend/ventanilla.db`) es solo para desarrollo. En Vercel, SQLite en `/tmp` solo permite que la API arranque como demostración y no conserva datos de forma confiable; conecta PostgreSQL antes de registrar turnos reales.
- En Vercel, las funciones Python están en Beta según la documentación actual de Vercel. Revisa disponibilidad y límites del plan antes de depender de ellas para operación continua.
- Este MVP no tiene login, roles, auditoría avanzada ni manejo adecuado de datos bancarios. No uses información financiera real hasta añadir esas protecciones.
