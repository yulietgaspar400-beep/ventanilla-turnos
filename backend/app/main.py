from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
import sqlite3
import os
from typing import Literal

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

DB_PATH = (
    Path("/tmp") / "ventanilla.db"
    if os.getenv("VERCEL")
    else Path(__file__).resolve().parent.parent / "ventanilla.db"
)
SERVICES = {"Caja", "Atención al cliente", "Asesoría"}


def connect():
    if os.getenv("DATABASE_URL"):
        import psycopg
        from psycopg.rows import dict_row
        return PostgresConnection(psycopg.connect(os.environ["DATABASE_URL"], row_factory=dict_row, sslmode="require"))
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    return db


class PostgresConnection:
    def __init__(self, connection):
        self.connection = connection
    def __enter__(self):
        self.connection.__enter__()
        return self
    def __exit__(self, *args):
        return self.connection.__exit__(*args)
    def execute(self, sql, params=()):
        sql = sql.replace("?", "%s").replace("substr(creado_en,1,10)", "CAST(creado_en AS DATE)::text")
        return self.connection.execute(sql, params)


@asynccontextmanager
async def lifespan(_: FastAPI):
    with connect() as db:
        postgres = bool(os.getenv("DATABASE_URL"))
        db.execute("""CREATE TABLE IF NOT EXISTS turnos (
            id """ + ("SERIAL" if postgres else "INTEGER") + """ PRIMARY KEY,
            folio TEXT NOT NULL,
            nombre TEXT NOT NULL,
            servicio TEXT NOT NULL,
            estado TEXT NOT NULL DEFAULT 'pendiente',
            creado_en """ + ("TIMESTAMPTZ" if postgres else "TEXT") + """ NOT NULL,
            llamado_en """ + ("TIMESTAMPTZ" if postgres else "TEXT") + """,
            atendido_en """ + ("TIMESTAMPTZ" if postgres else "TEXT") + """
        )""")
    yield


app = FastAPI(title="API Ventanilla", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4200", "http://127.0.0.1:4200"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class TurnoCreate(BaseModel):
    nombre: str = Field(min_length=2, max_length=100)
    servicio: Literal["Caja", "Atención al cliente", "Asesoría", "Ventanilla"] = "Ventanilla"


def as_dict(row):
    if not row:
        return None
    if isinstance(row, dict):
        return {k: (v.isoformat() if isinstance(v, datetime) else v) for k, v in row.items()}
    return dict(row)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/sala")
def pantalla_sala():
    """Public display data: show called folios only, never customer names."""
    with connect() as db:
        rows = db.execute(
            "SELECT folio, servicio, llamado_en FROM turnos "
            "WHERE estado='llamado' ORDER BY llamado_en DESC LIMIT 8"
        ).fetchall()
        return [as_dict(row) for row in rows]


@app.post("/api/turnos", status_code=201)
def crear_turno(payload: TurnoCreate):
    now = datetime.now(timezone.utc)
    day = now.strftime("%Y%m%d")
    prefix = {"Caja": "C", "Atención al cliente": "A", "Asesoría": "S", "Ventanilla": "V"}[payload.servicio]
    with connect() as db:
        count = db.execute(
            "SELECT COUNT(*) AS total FROM turnos WHERE substr(creado_en,1,10)=? AND servicio=?",
            (now.date().isoformat(), payload.servicio),
        ).fetchone()
        count = count["total"] if isinstance(count, dict) else count[0]
        folio = f"{prefix}-{day}-{count + 1:03d}"
        cur = db.execute(
            "INSERT INTO turnos (folio,nombre,servicio,creado_en) VALUES (?,?,?,?) RETURNING id",
            (folio, payload.nombre.strip(), payload.servicio, now.isoformat()),
        )
        new_id = cur.fetchone()
        new_id = new_id["id"] if isinstance(new_id, dict) else new_id[0]
        return as_dict(db.execute("SELECT * FROM turnos WHERE id=?", (new_id,)).fetchone())


@app.get("/api/turnos")
def listar_turnos(months: int = Query(default=4, ge=1, le=24), estado: str | None = None):
    since = (datetime.now(timezone.utc) - timedelta(days=30 * months)).isoformat()
    sql = "SELECT * FROM turnos WHERE creado_en >= ?"
    params: list = [since]
    if estado:
        sql += " AND estado = ?"
        params.append(estado)
    sql += " ORDER BY creado_en DESC"
    with connect() as db:
        return [as_dict(r) for r in db.execute(sql, params).fetchall()]


@app.get("/api/turnos/next")
def siguiente_turno():
    with connect() as db:
        return as_dict(db.execute(
            "SELECT * FROM turnos WHERE estado='pendiente' ORDER BY creado_en, id LIMIT 1"
        ).fetchone())


@app.post("/api/turnos/{turno_id}/call")
def llamar_turno(turno_id: int):
    with connect() as db:
        row = db.execute("SELECT * FROM turnos WHERE id=?", (turno_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Turno no encontrado")
        if row["estado"] not in ("pendiente", "llamado"):
            raise HTTPException(409, "El turno ya fue atendido")
        db.execute("UPDATE turnos SET estado='llamado', llamado_en=? WHERE id=?",
                   (datetime.now(timezone.utc).isoformat(), turno_id))
        return as_dict(db.execute("SELECT * FROM turnos WHERE id=?", (turno_id,)).fetchone())


@app.post("/api/turnos/{turno_id}/complete")
def completar_turno(turno_id: int):
    with connect() as db:
        row = db.execute("SELECT * FROM turnos WHERE id=?", (turno_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Turno no encontrado")
        if row["estado"] == "atendido":
            raise HTTPException(409, "El turno ya fue atendido")
        db.execute("UPDATE turnos SET estado='atendido', atendido_en=? WHERE id=?",
                   (datetime.now(timezone.utc).isoformat(), turno_id))
        return as_dict(db.execute("SELECT * FROM turnos WHERE id=?", (turno_id,)).fetchone())


@app.get("/api/dashboard")
def dashboard():
    today = datetime.now(timezone.utc).date().isoformat()
    with connect() as db:
        counts = {r["estado"]: r["total"] for r in db.execute(
            "SELECT estado, COUNT(*) total FROM turnos WHERE substr(creado_en,1,10)=? GROUP BY estado", (today,)
        ).fetchall()}
        next_row = db.execute("SELECT * FROM turnos WHERE estado='pendiente' ORDER BY creado_en,id LIMIT 1").fetchone()
    return {"fecha": today, "pendientes": counts.get("pendiente", 0),
            "llamados": counts.get("llamado", 0), "atendidos": counts.get("atendido", 0),
            "siguiente": as_dict(next_row)}
