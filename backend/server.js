"use strict";

const path = require("path");
const fs = require("fs");
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const { Pool } = require("pg");

const PORT = process.env.PORT || 3000;
const FRONTEND_DIR = path.join(__dirname, "..", "frontend");
const SCHEMA_PATH = path.join(__dirname, "models", "schema.sql");

const { DATABASE_URL, PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE, PGSSLMODE } = process.env;

const connectionString =
  DATABASE_URL ||
  (PGHOST &&
    `postgresql://${encodeURIComponent(PGUSER)}:${encodeURIComponent(PGPASSWORD)}@${PGHOST}:${PGPORT || 5432}/${PGDATABASE}`);

if (!connectionString) {
  console.error("No se encontró cadena de conexión a Postgres. Define DATABASE_URL o variables PG*.");
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl:
    PGSSLMODE === "require" || (connectionString || "").includes("sslmode=require")
      ? { rejectUnauthorized: false }
      : undefined,
});

const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "1mb" }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false }));
app.use(express.static(FRONTEND_DIR));

const ensureSchema = async () => {
  const ddl = fs.readFileSync(SCHEMA_PATH, "utf8");
  await pool.query(ddl);
  console.log("Schema verificado/aplicado en Postgres.");
};

const nt = (v) => (v === undefined || v === null ? "" : String(v).trim());

const normName = (name) =>
  name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

// ─── Health ───────────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => res.json({ ok: true, status: "healthy" }));

// ─── Sugerencias (autocomplete) ──────────────────────────────────────────────
app.get("/api/sugerencias", async (req, res) => {
  const allowed = { medico: "medico", club: "club", asociacion: "asociacion" };
  const col = allowed[req.query.tipo];
  if (!col) return res.status(400).json({ error: "tipo inválido" });
  try {
    const base = `WHERE ${col} IS NOT NULL AND ${col} NOT IN ('','N/D','N/A','-','NINGUNA')`;
    let query, params = [];
    if (col === "club" && req.query.asociacion) {
      query = `SELECT DISTINCT club AS val FROM registros ${base} AND asociacion = $1 ORDER BY val LIMIT 150`;
      params = [req.query.asociacion];
    } else {
      query = `SELECT DISTINCT ${col} AS val FROM registros ${base} ORDER BY val LIMIT 150`;
    }
    const { rows } = await pool.query(query, params);
    res.json(rows.map(r => r.val).filter(Boolean));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Stats ────────────────────────────────────────────────────────────────────
app.get("/api/stats", async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        (SELECT COUNT(*)::int FROM pacientes) AS total_pacientes,
        (SELECT COUNT(*)::int FROM registros) AS total_consultas,
        (SELECT COUNT(*)::int FROM registros WHERE created_at >= CURRENT_DATE) AS hoy,
        (SELECT COUNT(*)::int FROM registros WHERE requiereAmbulancia = TRUE) AS traslados
    `);
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Registros (legacy) ───────────────────────────────────────────────────────
app.get("/api/registros", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM registros ORDER BY created_at DESC LIMIT 200");
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Pacientes ────────────────────────────────────────────────────────────────
app.get("/api/pacientes", async (req, res) => {
  try {
    const { q } = req.query;
    const params = [];
    let where = "";
    if (q && q.trim().length > 0) {
      where = " WHERE p.nombre_normalizado ILIKE $1";
      params.push(`%${normName(q)}%`);
    }
    const sql = `
      SELECT p.*,
             COUNT(r.id)::int AS total_consultas,
             MAX(r.created_at) AS ultima_consulta
      FROM pacientes p
      LEFT JOIN registros r ON r.paciente_id = p.id
      ${where}
      GROUP BY p.id
      ORDER BY ultima_consulta DESC NULLS LAST, p.created_at DESC
      LIMIT 200
    `;
    const { rows } = await pool.query(sql, params);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Search patient by name (must be before /:id route)
app.get("/api/pacientes/buscar", async (req, res) => {
  try {
    const { nombre } = req.query;
    if (!nombre || nombre.trim().length < 2) return res.json({ paciente: null, sugerencias: [] });

    const norm = normName(nombre);

    // Exact match
    const { rows: exact } = await pool.query(
      `SELECT p.*, COUNT(r.id)::int AS total_consultas
       FROM pacientes p LEFT JOIN registros r ON r.paciente_id = p.id
       WHERE p.nombre_normalizado = $1 GROUP BY p.id`,
      [norm]
    );

    if (exact.length) {
      const p = exact[0];
      const { rows: last } = await pool.query(
        `SELECT * FROM registros WHERE paciente_id = $1 ORDER BY numero_consulta DESC LIMIT 1`,
        [p.id]
      );
      return res.json({ paciente: p, total_consultas: p.total_consultas, lastConsulta: last[0] || null, sugerencias: [] });
    }

    // Partial matches
    const { rows: partial } = await pool.query(
      `SELECT p.*, COUNT(r.id)::int AS total_consultas
       FROM pacientes p LEFT JOIN registros r ON r.paciente_id = p.id
       WHERE p.nombre_normalizado ILIKE $1 GROUP BY p.id LIMIT 5`,
      [`%${norm}%`]
    );
    res.json({ paciente: null, sugerencias: partial });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get consultations for a patient
app.get("/api/pacientes/:id/consultas", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM registros WHERE paciente_id = $1 ORDER BY numero_consulta ASC`,
      [parseInt(req.params.id)]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Create registro ──────────────────────────────────────────────────────────
app.post("/api/registros", async (req, res) => {
  const b = req.body || {};
  const p = {
    nombreCompleto: nt(b.nombreCompleto),
    numeroEmergencia: nt(b.numeroEmergencia),
    fechaNacimiento: nt(b.fechaNacimiento),
    edad: b.edad ? Number(b.edad) : null,
    asociacion: nt(b.asociacion),
    club: nt(b.club),
    tipoSangre: nt(b.tipoSangre),
    ta: nt(b.ta), fc: nt(b.fc), fr: nt(b.fr),
    temp: nt(b.temp), glucosa: nt(b.glucosa), spo2: nt(b.spo2),
    sintomas: nt(b.sintomas), eventoPrevio: nt(b.eventoPrevio),
    antecedentes: nt(b.antecedentes), medicamentos: nt(b.medicamentos),
    alergias: nt(b.alergias), diagnostico: nt(b.diagnostico),
    tx: nt(b.tx), indicaciones: nt(b.indicaciones), medico: nt(b.medico),
    requiereAmbulancia: !!b.requiereAmbulancia,
    observacionTraslado: nt(b.observacionTraslado),
    hospitalDestino: nt(b.hospitalDestino), motivoTraslado: nt(b.motivoTraslado),
    paramedico: nt(b.paramedico), firmaMedico: nt(b.firmaMedico),
  };

  if (!p.nombreCompleto || !p.numeroEmergencia || !p.asociacion || !p.club) {
    return res.status(400).json({ error: "Faltan campos obligatorios de datos generales." });
  }

  try {
    const norm = normName(p.nombreCompleto);
    let pacienteId = b.pacienteId ? parseInt(b.pacienteId) : null;

    if (!pacienteId) {
      const { rows: found } = await pool.query(
        `SELECT id FROM pacientes WHERE nombre_normalizado = $1`,
        [norm]
      );
      if (found.length) {
        pacienteId = found[0].id;
        await pool.query(
          `UPDATE pacientes SET nombre_completo=$1, numero_emergencia=$2, asociacion=$3, club=$4,
           tipo_sangre=COALESCE(NULLIF($5,''), tipo_sangre),
           fecha_nacimiento=COALESCE(NULLIF($6,''), fecha_nacimiento) WHERE id=$7`,
          [p.nombreCompleto, p.numeroEmergencia, p.asociacion, p.club, p.tipoSangre, p.fechaNacimiento, pacienteId]
        );
      } else {
        const { rows: newP } = await pool.query(
          `INSERT INTO pacientes (nombre_completo, nombre_normalizado, numero_emergencia, fecha_nacimiento, asociacion, club, tipo_sangre)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
          [p.nombreCompleto, norm, p.numeroEmergencia, p.fechaNacimiento || null, p.asociacion, p.club, p.tipoSangre || null]
        );
        pacienteId = newP[0].id;
      }
    }

    const { rows: cnt } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM registros WHERE paciente_id=$1`, [pacienteId]
    );
    const numConsulta = cnt[0].n + 1;

    const { rows: ins } = await pool.query(
      `INSERT INTO registros (
        paciente_id, numero_consulta,
        nombreCompleto, numeroEmergencia, asociacion, club,
        fechaNacimiento, edad, tipoSangre,
        ta, fc, fr, temp, glucosa, spo2,
        sintomas, eventoPrevio, antecedentes, medicamentos, alergias,
        diagnostico, tx, indicaciones, medico,
        requiereAmbulancia, observacionTraslado, hospitalDestino, motivoTraslado, paramedico, firmaMedico
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
        $16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30
      ) RETURNING id`,
      [
        pacienteId, numConsulta,
        p.nombreCompleto, p.numeroEmergencia, p.asociacion, p.club,
        p.fechaNacimiento || null, p.edad, p.tipoSangre || null,
        p.ta || null, p.fc || null, p.fr || null, p.temp || null, p.glucosa || null, p.spo2 || null,
        p.sintomas || null, p.eventoPrevio || null, p.antecedentes || null,
        p.medicamentos || null, p.alergias || null, p.diagnostico || null,
        p.tx || null, p.indicaciones || null, p.medico || null,
        p.requiereAmbulancia,
        p.observacionTraslado || null, p.hospitalDestino || null,
        p.motivoTraslado || null, p.paramedico || null, p.firmaMedico || null,
      ]
    );

    res.json({ ok: true, id: ins[0].id, pacienteId, numeroConsulta: numConsulta });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.use((_req, res) => res.status(404).json({ error: "Ruta no encontrada" }));

const start = async () => {
  try {
    await ensureSchema();
    app.listen(PORT, () => console.log(`API escuchando en http://localhost:${PORT}`));
  } catch (e) {
    console.error("No se pudo iniciar:", e.message);
    process.exit(1);
  }
};

start();
