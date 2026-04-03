CREATE TABLE IF NOT EXISTS pacientes (
  id SERIAL PRIMARY KEY,
  nombre_completo TEXT NOT NULL,
  nombre_normalizado TEXT NOT NULL,
  numero_emergencia TEXT,
  fecha_nacimiento TEXT,
  asociacion TEXT,
  club TEXT,
  tipo_sangre TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS registros (
  id SERIAL PRIMARY KEY,
  paciente_id INTEGER,
  numero_consulta INTEGER DEFAULT 1,
  nombreCompleto TEXT NOT NULL,
  numeroEmergencia TEXT NOT NULL,
  fechaNacimiento TEXT,
  edad INTEGER,
  asociacion TEXT NOT NULL,
  club TEXT NOT NULL,
  tipoSangre TEXT,
  ta TEXT,
  fc TEXT,
  fr TEXT,
  temp TEXT,
  glucosa TEXT,
  spo2 TEXT,
  sintomas TEXT,
  eventoPrevio TEXT,
  antecedentes TEXT,
  medicamentos TEXT,
  alergias TEXT,
  diagnostico TEXT,
  tx TEXT,
  indicaciones TEXT,
  medico TEXT,
  requiereAmbulancia BOOLEAN DEFAULT FALSE,
  observacionTraslado TEXT,
  hospitalDestino TEXT,
  motivoTraslado TEXT,
  paramedico TEXT,
  firmaMedico TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Safe migrations for existing tables
ALTER TABLE registros ADD COLUMN IF NOT EXISTS paciente_id INTEGER;
ALTER TABLE registros ADD COLUMN IF NOT EXISTS numero_consulta INTEGER DEFAULT 1;
ALTER TABLE registros ADD COLUMN IF NOT EXISTS diagnostico TEXT;
ALTER TABLE registros ADD COLUMN IF NOT EXISTS fechaNacimiento TEXT;
ALTER TABLE registros ADD COLUMN IF NOT EXISTS edad INTEGER;
ALTER TABLE registros ADD COLUMN IF NOT EXISTS tipoSangre TEXT;
ALTER TABLE registros ADD COLUMN IF NOT EXISTS observacionTraslado TEXT;
ALTER TABLE registros ADD COLUMN IF NOT EXISTS firmaMedico TEXT;
