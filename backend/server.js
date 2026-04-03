"use strict";

const path = require("path");
const fs = require("fs");
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const sqlite3 = require("sqlite3").verbose();

const PORT = process.env.PORT || 3000;
const ROOT_DIR = path.join(__dirname, "..");
const FRONTEND_DIR = path.join(ROOT_DIR, "frontend");
const DB_PATH = path.join(__dirname, "camporee.db");
const SCHEMA_PATH = path.join(__dirname, "models", "schema.sql");

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

// DB setup
const db = new sqlite3.Database(DB_PATH);
const ensureSchema = () => {
  const ddl = fs.readFileSync(SCHEMA_PATH, "utf8");
  db.exec(ddl, (err) => {
    if (err) {
      console.error("Error al aplicar schema:", err.message);
    }
  });
};
ensureSchema();

// Asegura columnas nuevas en caso de DB ya existente
const addColumnIfMissing = (col, type) => {
  db.get(
    `PRAGMA table_info(registros)`,
    [],
    (err /* row not used */) => {
      if (err) return console.error("PRAGMA error:", err.message);
      db.all(`PRAGMA table_info(registros)`, [], (e, rows) => {
        if (e) return console.error("PRAGMA error:", e.message);
        const exists = rows.some((r) => r.name === col);
        if (!exists) {
          db.run(`ALTER TABLE registros ADD COLUMN ${col} ${type}`, (alterErr) => {
            if (alterErr) console.error(`No se pudo añadir columna ${col}:`, alterErr.message);
          });
        }
      });
    }
  );
};

["fechaNacimiento TEXT", "edad INTEGER", "tipoSangre TEXT", "observacionTraslado TEXT", "firmaMedico TEXT"].forEach(
  (colSpec) => {
    const [name, ...typeParts] = colSpec.split(" ");
    addColumnIfMissing(name, typeParts.join(" "));
  }
);

const normalizeText = (value) => {
  if (value === undefined || value === null) return "";
  return String(value).trim();
};

app.get("/health", (_req, res) => {
  res.json({ ok: true, status: "healthy" });
});

app.get("/api/registros", (_req, res) => {
  const sql = "SELECT * FROM registros ORDER BY created_at DESC LIMIT 200";
  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post("/api/registros", (req, res) => {
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
    requiereAmbulancia: body.requiereAmbulancia ? 1 : 0,
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
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `;

  const values = [
    payload.nombreCompleto,
    payload.numeroEmergencia,
    payload.asociacion,
    payload.club,
    payload.fechaNacimiento,
    payload.edad,
    payload.tipoSangre,
    payload.ta,
    payload.fc,
    payload.fr,
    payload.temp,
    payload.glucosa,
    payload.spo2,
    payload.sintomas,
    payload.eventoPrevio,
    payload.antecedentes,
    payload.medicamentos,
    payload.alergias,
    payload.tx,
    payload.indicaciones,
    payload.medico,
    payload.requiereAmbulancia,
    payload.observacionTraslado,
    payload.hospitalDestino,
    payload.motivoTraslado,
    payload.paramedico,
    payload.firmaMedico,
  ];

  db.run(insertSQL, values, function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ ok: true, id: this.lastID });
  });
});

app.use((req, res) => {
  res.status(404).json({ error: "Ruta no encontrada" });
});

app.listen(PORT, () => {
  console.log(`API escuchando en http://localhost:${PORT}`);
});
