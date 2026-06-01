CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS admins (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email        VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role         VARCHAR(50) DEFAULT 'editor' CHECK (role IN ('superadmin', 'editor')),
  created_at   TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS players (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone         VARCHAR(30) UNIQUE NOT NULL,
  name          VARCHAR(100),
  subscribed_at TIMESTAMP DEFAULT NOW(),
  is_active     BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS questions (
  id         VARCHAR(50) PRIMARY KEY,
  text_fr    TEXT NOT NULL,
  text_ar    TEXT,
  answer     BOOLEAN NOT NULL,
  category   VARCHAR(100) DEFAULT 'coupe_du_monde',
  difficulty VARCHAR(20) DEFAULT 'medium' CHECK (difficulty IN ('easy','medium','hard')),
  image_url  VARCHAR(500),
  is_active  BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS prizes (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  label       VARCHAR(255) NOT NULL,
  description TEXT,
  image_url   VARCHAR(500),
  tier        VARCHAR(30) DEFAULT 'daily' CHECK (tier IN ('daily','weekly','monthly','grand')),
  quantity    INT DEFAULT 1,
  is_active   BOOLEAN DEFAULT true,
  updated_at  TIMESTAMP DEFAULT NOW(),
  updated_by  UUID REFERENCES admins(id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_id     UUID REFERENCES players(id),
  started_at    TIMESTAMP DEFAULT NOW(),
  ended_at      TIMESTAMP,
  score         INT DEFAULT 0,
  correct_count INT DEFAULT 0,
  total_time_ms INT DEFAULT 0,
  avg_speed_ms  INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS answers (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id       UUID REFERENCES sessions(id),
  question_id      VARCHAR(50) REFERENCES questions(id),
  is_correct       BOOLEAN NOT NULL,
  response_time_ms INT NOT NULL,
  answered_at      TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id   UUID REFERENCES admins(id),
  action     VARCHAR(100),
  entity     VARCHAR(50),
  entity_id  VARCHAR(100),
  old_data   JSONB,
  new_data   JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Réglages globaux (clé/valeur)
CREATE TABLE IF NOT EXISTS settings (
  key        VARCHAR(50) PRIMARY KEY,
  value      TEXT,
  updated_at TIMESTAMP DEFAULT NOW()
);
INSERT INTO settings (key, value) VALUES ('prizes_enabled', 'true')
  ON CONFLICT (key) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_sessions_player ON sessions(player_id);
CREATE INDEX IF NOT EXISTS idx_answers_session ON answers(session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_score ON sessions(score DESC);
