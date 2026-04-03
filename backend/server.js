"use strict";

const path = require("path");
const fs = require("fs");
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const { Pool } = require("pg");

const PORT = process.env.PORT || 3000;
const ROOT_DIR = path.join(__dirname, "..");
const FRONTEND_DIR = path.join(ROOT_DIR, "frontend");
const SCHEMA_PATH = path.join(__dirname, "models", "schema.sql");

const {
  DATABASE_URL,
  PGHOST,
  PGPORT,
  PGUSER,
  PGPASSWORD,
  PGDATABASE,
  PGSSLMODE,
} = process.env;

const connectionString =
  DATABASE_URL ||
  (PGHOST &&
    `postgresql://${encodeURIComponent(PGUSER)}:${encodeURIComponent(
      PGPASSWORD
    )}@${PGHOST}:${PGPORT || 5432}/${PGDATABASE}`);

if (!connectionString) {
  console.error(
    "No se encontró cadena de conexión a Postgres. Define DATABASE_URL o variables PGHOST/PGUSER/PGPASSWORD/PGDATABASE."
  );
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl:
    PGSSLMODE === "require" || (connectionString && connectionString.includes("sslmode=require"))
      ? { rejectUnauthorized: false }
      : undefined,
});

const app = express();

app.use(
  helmet({
    contentSecurityPolicy: false,
  })
);
app.use(
  cors({
    origin: "*",
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.use(express.static(FRONTEND_DIR));

const ensureSchema = async () => {
  try {
    const ddl = fs.readFileSync(SCHEMA_PATH, "utf8");
    await pool.query(ddl);
    console.log("Schema verificado/aplicado en Postgres.");
  } catch (err) {
    console.error("Error al aplicar schema en Postgres:", err.message);
    throw err;
  }
};

const normalizeText = (value) => {
  if (value === undefined || value === null) return "";
  return String(value).trim();
};

app.get("/health", (_req, res) => {
  res.json({ ok: true, status: "healthy" });
});

app.get("/api/registros", async (_req, res) => {
  try {
    const sql = "SELECT * FROM registros ORDER BY created_at DESC LIMIT 200";
    const { rows } = await pool.query(sql);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/registros", async (req, res) => {
  const body = req.body || {};

  const payload = {
    nombreCompleto: normalizeText(body.nombreCompleto),
    numeroEmergencia: normalizeText(body.numeroEmergencia),
    fechaNacimiento: normalizeText(body.fechaNacimiento),
    edad: body.edad ? Number(body.edad) : null,
    asociacion: normalizeText(body.asociacion),
    club: normalizeText(body.club),
    tipoSangre: normalizeText(body.tipoSangre),
    ta: normalizeText(body.ta),
    fc: normalizeText(body.fc),
    fr: normalizeText(body.fr),
    temp: normalizeText(body.temp),
    glucosa: normalizeText(body.glucosa),
    spo2: normalizeText(body.spo2),
    sintomas: normalizeText(body.sintomas),
    eventoPrevio: normalizeText(body.eventoPrevio),
    antecedentes: normalizeText(body.antecedentes),
    medicamentos: normalizeText(body.medicamentos),
    alergias: normalizeText(body.alergias),
    tx: normalizeText(body.tx),
    indicaciones: normalizeText(body.indicaciones),
    medico: normalizeText(body.medico),
    requiereAmbulancia: body.requiereAmbulancia ? true : false,
    observacionTraslado: normalizeText(body.observacionTraslado),
    hospitalDestino: normalizeText(body.hospitalDestino),
    motivoTraslado: normalizeText(body.motivoTraslado),
    paramedico: normalizeText(body.paramedico),
    firmaMedico: normalizeText(body.firmaMedico),
  };

  if (
    !payload.nombreCompleto ||
    !payload.numeroEmergencia ||
    !payload.asociacion ||
    !payload.club
  ) {
    return res
      .status(400)
      .json({ error: "Faltan campos obligatorios de datos generales." });
  }

  const insertSQL = `
    INSERT INTO registros (
      nombreCompleto, numeroEmergencia, asociacion, club,
      fechaNacimiento, edad, tipoSangre,
      ta, fc, fr, temp, glucosa, spo2,
      sintomas, eventoPrevio, antecedentes, medicamentos, alergias,
      tx, indicaciones, medico,
      requiereAmbulancia, observacionTraslado, hospitalDestino, motivoTraslado, paramedico, firmaMedico
    ) VALUES (
      $1,$2,$3,$4,
      $5,$6,$7,
      $8,$9,$10,$11,$12,$13,
      $14,$15,$16,$17,$18,
      $19,$20,$21,
      $22,$23,$24,$25,$26,$27
    ) RETURNING id
  `;

  const values = [
    payload.nombreCompleto,
    payload.numeroEmergencia,
    payload.asociacion,
    payload.club,
    payload.fechaNacimiento || null,
    payload.edad !== null ? payload.edad : null,
    payload.tipoSangre || null,
    payload.ta || null,
    payload.fc || null,
    payload.fr || null,
    payload.temp || null,
    payload.glucosa || null,
    payload.spo2 || null,
    payload.sintomas || null,
    payload.eventoPrevio || null,
    payload.antecedentes || null,
    payload.medicamentos || null,
    payload.alergias || null,
    payload.tx || null,
    payload.indicaciones || null,
    payload.medico || null,
    payload.requiereAmbulancia,
    payload.observacionTraslado || null,
    payload.hospitalDestino || null,
    payload.motivoTraslado || null,
    payload.paramedico || null,
    payload.firmaMedico || null,
  ];

  try {
    const result = await pool.query(insertSQL, values);
    res.json({ ok: true, id: result.rows[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.use((req, res) => {
  res.status(404).json({ error: "Ruta no encontrada" });
});

const start = async () => {
  try {
    await ensureSchema();
    app.listen(PORT, () => {
      console.log(`API escuchando en http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("No se pudo iniciar la API:", err.message);
    process.exit(1);
  }
};

start();
