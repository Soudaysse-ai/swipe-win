-- ============================================================================
-- Défi Yas 2.0 — schéma de la plateforme multijoueur.
-- Migration ADDITIVE : aucune table ni donnée existante n'est supprimée.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Utilisateurs ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone             VARCHAR(20) NOT NULL UNIQUE,
  phone_verified    BOOLEAN NOT NULL DEFAULT false,
  password_hash     VARCHAR(255) NOT NULL,
  username          VARCHAR(20) NOT NULL,
  avatar            VARCHAR(40) NOT NULL DEFAULT 'yas-01',
  status            VARCHAR(20) NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','suspended','banned','deleted')),
  suspended_until   TIMESTAMPTZ,
  legacy_player_id  UUID UNIQUE REFERENCES players(id),
  terms_accepted_at TIMESTAMPTZ NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at      TIMESTAMPTZ,
  deleted_at        TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_username_lower ON users (LOWER(username));
CREATE INDEX IF NOT EXISTS idx_users_created ON users (created_at);

CREATE TABLE IF NOT EXISTS profiles (
  user_id      UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  bio          VARCHAR(160),
  show_stats   BOOLEAN NOT NULL DEFAULT true,
  allow_invites BOOLEAN NOT NULL DEFAULT true,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at   TIMESTAMPTZ NOT NULL,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at   TIMESTAMPTZ,
  user_agent   VARCHAR(300),
  ip           VARCHAR(64)
);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions (user_id);

CREATE TABLE IF NOT EXISTS otp_codes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone       VARCHAR(20) NOT NULL,
  purpose     VARCHAR(20) NOT NULL CHECK (purpose IN ('register','reset')),
  code_hash   VARCHAR(255) NOT NULL,
  attempts    INT NOT NULL DEFAULT 0,
  expires_at  TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_otp_phone ON otp_codes (phone, purpose, created_at DESC);

CREATE TABLE IF NOT EXISTS friend_requests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status       VARCHAR(20) NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','accepted','declined','cancelled')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  CHECK (from_user_id <> to_user_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_friend_requests_pending
  ON friend_requests (LEAST(from_user_id, to_user_id), GREATEST(from_user_id, to_user_id))
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_friend_requests_to ON friend_requests (to_user_id, status);

-- Une ligne par paire, user_a < user_b.
CREATE TABLE IF NOT EXISTS friendships (
  user_a     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_a, user_b),
  CHECK (user_a < user_b)
);
CREATE INDEX IF NOT EXISTS idx_friendships_b ON friendships (user_b);

CREATE TABLE IF NOT EXISTS blocked_users (
  blocker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

-- ── Jeux ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS games (
  id            VARCHAR(20) PRIMARY KEY,
  name          VARCHAR(60) NOT NULL,
  description   TEXT,
  min_players   INT NOT NULL,
  max_players   INT NOT NULL,
  rating_system VARCHAR(20) NOT NULL CHECK (rating_system IN ('elo','openskill')),
  is_active     BOOLEAN NOT NULL DEFAULT true,
  sort_order    INT NOT NULL DEFAULT 0,
  config        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS game_rules_versions (
  id         SERIAL PRIMARY KEY,
  game_id    VARCHAR(20) NOT NULL REFERENCES games(id),
  version    VARCHAR(20) NOT NULL,
  rules      JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_current BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (game_id, version)
);

CREATE TABLE IF NOT EXISTS game_rooms (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        VARCHAR(12) NOT NULL UNIQUE,
  game_id     VARCHAR(20) NOT NULL REFERENCES games(id),
  host_id     UUID REFERENCES users(id),
  visibility  VARCHAR(10) NOT NULL CHECK (visibility IN ('public','private')),
  source      VARCHAR(20) NOT NULL DEFAULT 'room'
              CHECK (source IN ('room','quickplay','invite','rematch','tournament')),
  status      VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_game','closed')),
  max_players INT NOT NULL,
  settings    JSONB NOT NULL DEFAULT '{}'::jsonb,
  tournament_match_id UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_rooms_open ON game_rooms (game_id, visibility, status);

CREATE TABLE IF NOT EXISTS room_players (
  room_id   UUID NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES users(id),
  is_ready  BOOLEAN NOT NULL DEFAULT false,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at   TIMESTAMPTZ,
  PRIMARY KEY (room_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_room_players_user ON room_players (user_id) WHERE left_at IS NULL;

CREATE TABLE IF NOT EXISTS matches (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id       VARCHAR(20) NOT NULL REFERENCES games(id),
  room_id       UUID REFERENCES game_rooms(id),
  rules_version VARCHAR(20) NOT NULL,
  status        VARCHAR(20) NOT NULL DEFAULT 'WAITING'
                CHECK (status IN ('WAITING','READY','IN_PROGRESS','RECONNECTING','COMPLETED','CANCELLED')),
  mode          VARCHAR(20) NOT NULL DEFAULT 'room',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at    TIMESTAMPTZ,
  ended_at      TIMESTAMPTZ,
  state         JSONB,
  state_version INT NOT NULL DEFAULT 0,
  result        JSONB,
  end_reason    VARCHAR(40),
  is_valid      BOOLEAN,
  flags         JSONB NOT NULL DEFAULT '[]'::jsonb,
  review_status VARCHAR(20) CHECK (review_status IN ('pending','cleared','voided')),
  tournament_match_id UUID
);
CREATE INDEX IF NOT EXISTS idx_matches_game_status ON matches (game_id, status);
CREATE INDEX IF NOT EXISTS idx_matches_ended ON matches (ended_at);
CREATE INDEX IF NOT EXISTS idx_matches_review ON matches (review_status) WHERE review_status IS NOT NULL;

CREATE TABLE IF NOT EXISTS match_players (
  match_id        UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id),
  seat            INT NOT NULL,
  placement       INT,
  outcome         VARCHAR(10) CHECK (outcome IN ('win','loss','draw','placed')),
  score           INT,
  actions_count   INT NOT NULL DEFAULT 0,
  disconnects     INT NOT NULL DEFAULT 0,
  disconnected_ms BIGINT NOT NULL DEFAULT 0,
  active_ms       BIGINT NOT NULL DEFAULT 0,
  rating_before   NUMERIC(8,2),
  rating_after    NUMERIC(8,2),
  stats           JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (match_id, user_id),
  UNIQUE (match_id, seat)
);
CREATE INDEX IF NOT EXISTS idx_match_players_user ON match_players (user_id);

CREATE TABLE IF NOT EXISTS match_events (
  id         BIGSERIAL PRIMARY KEY,
  match_id   UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  seq        INT NOT NULL,
  user_id    UUID REFERENCES users(id),
  type       VARCHAR(40) NOT NULL,
  payload    JSONB NOT NULL DEFAULT '{}'::jsonb,
  command_id VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (match_id, seq)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_match_events_command
  ON match_events (match_id, user_id, command_id) WHERE command_id IS NOT NULL;

-- Une ligne = résultat officiel traité (clé d'idempotence de la fin de match).
CREATE TABLE IF NOT EXISTS match_results (
  match_id     UUID PRIMARY KEY REFERENCES matches(id) ON DELETE CASCADE,
  game_id      VARCHAR(20) NOT NULL REFERENCES games(id),
  is_valid     BOOLEAN NOT NULL,
  is_draw      BOOLEAN NOT NULL DEFAULT false,
  placements   JSONB NOT NULL,
  duration_ms  BIGINT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_match_results_game ON match_results (game_id, processed_at);

-- ── Progression ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS seasons (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(80) NOT NULL,
  starts_at  TIMESTAMPTZ NOT NULL,
  ends_at    TIMESTAMPTZ NOT NULL,
  is_active  BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_at > starts_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_seasons_active ON seasons (is_active) WHERE is_active;

CREATE TABLE IF NOT EXISTS leagues (
  id         SERIAL PRIMARY KEY,
  game_id    VARCHAR(20) REFERENCES games(id),
  name       VARCHAR(30) NOT NULL,
  min_rating INT NOT NULL,
  sort_order INT NOT NULL,
  UNIQUE (game_id, name)
);

CREATE TABLE IF NOT EXISTS player_global_stats (
  user_id          UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  xp               BIGINT NOT NULL DEFAULT 0,
  level            INT NOT NULL DEFAULT 1,
  matches_played   INT NOT NULL DEFAULT 0,
  wins             INT NOT NULL DEFAULT 0,
  play_time_ms     BIGINT NOT NULL DEFAULT 0,
  active_days      INT NOT NULL DEFAULT 0,
  last_active_date DATE,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS player_game_stats (
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id           VARCHAR(20) NOT NULL REFERENCES games(id),
  games_played      INT NOT NULL DEFAULT 0,
  wins              INT NOT NULL DEFAULT 0,
  losses            INT NOT NULL DEFAULT 0,
  draws             INT NOT NULL DEFAULT 0,
  place_1           INT NOT NULL DEFAULT 0,
  place_2           INT NOT NULL DEFAULT 0,
  place_3           INT NOT NULL DEFAULT 0,
  place_4           INT NOT NULL DEFAULT 0,
  current_streak    INT NOT NULL DEFAULT 0,
  best_streak       INT NOT NULL DEFAULT 0,
  total_duration_ms BIGINT NOT NULL DEFAULT 0,
  total_moves       INT NOT NULL DEFAULT 0,
  rating            NUMERIC(8,2) NOT NULL DEFAULT 1000,
  rating_mu         DOUBLE PRECISION,
  rating_sigma      DOUBLE PRECISION,
  peak_rating       NUMERIC(8,2) NOT NULL DEFAULT 1000,
  rating_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  extra             JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_played_at    TIMESTAMPTZ,
  PRIMARY KEY (user_id, game_id)
);
CREATE INDEX IF NOT EXISTS idx_pgs_rating ON player_game_stats (game_id, rating DESC);

CREATE TABLE IF NOT EXISTS xp_transactions (
  id              BIGSERIAL PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  match_id        UUID REFERENCES matches(id),
  amount          INT NOT NULL,
  reason          VARCHAR(40) NOT NULL,
  idempotency_key VARCHAR(120) NOT NULL UNIQUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_xp_user ON xp_transactions (user_id, created_at);

CREATE TABLE IF NOT EXISTS rating_transactions (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id       VARCHAR(20) NOT NULL REFERENCES games(id),
  match_id      UUID REFERENCES matches(id),
  rating_before NUMERIC(8,2) NOT NULL,
  rating_after  NUMERIC(8,2) NOT NULL,
  mu_before     DOUBLE PRECISION,
  mu_after      DOUBLE PRECISION,
  sigma_before  DOUBLE PRECISION,
  sigma_after   DOUBLE PRECISION,
  reason        VARCHAR(40) NOT NULL DEFAULT 'match',
  admin_id      UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_rating_tx_match ON rating_transactions (user_id, match_id) WHERE reason = 'match';

-- Grand livre des points de saison (classement global).
CREATE TABLE IF NOT EXISTS season_points (
  id         BIGSERIAL PRIMARY KEY,
  season_id  INT NOT NULL REFERENCES seasons(id),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id    VARCHAR(20) NOT NULL REFERENCES games(id),
  match_id   UUID REFERENCES matches(id),
  placement  INT,
  points     INT NOT NULL,
  counted    BOOLEAN NOT NULL,
  reason     VARCHAR(40) NOT NULL DEFAULT 'match',
  admin_id   UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_season_points_match ON season_points (user_id, match_id) WHERE reason = 'match';
CREATE INDEX IF NOT EXISTS idx_season_points_board ON season_points (season_id, created_at);
CREATE INDEX IF NOT EXISTS idx_season_points_user_day ON season_points (user_id, game_id, created_at);

-- Instantanés quotidiens des rangs (pour l'évolution du rang).
CREATE TABLE IF NOT EXISTS leaderboard_entries (
  id            BIGSERIAL PRIMARY KEY,
  board         VARCHAR(30) NOT NULL,
  period        VARCHAR(10) NOT NULL,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rank          INT NOT NULL,
  value         NUMERIC(12,2) NOT NULL,
  snapshot_date DATE NOT NULL,
  UNIQUE (board, period, snapshot_date, user_id)
);

CREATE TABLE IF NOT EXISTS badges (
  id          VARCHAR(40) PRIMARY KEY,
  name        VARCHAR(60) NOT NULL,
  description VARCHAR(200) NOT NULL,
  icon        VARCHAR(16) NOT NULL,
  criteria    JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order  INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS player_badges (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_id   VARCHAR(40) NOT NULL REFERENCES badges(id),
  match_id   UUID REFERENCES matches(id),
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, badge_id)
);

-- ── Social ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       VARCHAR(40) NOT NULL,
  title      VARCHAR(120) NOT NULL,
  body       VARCHAR(300),
  data       JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS chat_messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id    UUID REFERENCES game_rooms(id) ON DELETE CASCADE,
  match_id   UUID REFERENCES matches(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       VARCHAR(10) NOT NULL DEFAULT 'text' CHECK (kind IN ('text','quick','reaction')),
  body       VARCHAR(200) NOT NULL,
  filtered   BOOLEAN NOT NULL DEFAULT false,
  hidden_at  TIMESTAMPTZ,
  hidden_by  UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chat_room ON chat_messages (room_id, created_at);

CREATE TABLE IF NOT EXISTS reports (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reported_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chat_message_id  UUID REFERENCES chat_messages(id) ON DELETE SET NULL,
  match_id         UUID REFERENCES matches(id) ON DELETE SET NULL,
  reason           VARCHAR(30) NOT NULL CHECK (reason IN ('insult','spam','cheating','inappropriate_name','other')),
  details          VARCHAR(500),
  status           VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','dismissed')),
  handled_by       UUID,
  handled_at       TIMESTAMPTZ,
  resolution       VARCHAR(500),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports (status, created_at);

-- ── Administration ──────────────────────────────────────────────────────────

ALTER TABLE admins DROP CONSTRAINT IF EXISTS admins_role_check;
UPDATE admins SET role = 'super_admin'    WHERE role = 'superadmin';
UPDATE admins SET role = 'platform_admin' WHERE role = 'editor';
ALTER TABLE admins ALTER COLUMN role SET DEFAULT 'data_analyst';
ALTER TABLE admins ADD COLUMN IF NOT EXISTS name VARCHAR(100);
ALTER TABLE admins ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE admins ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE admins ADD COLUMN IF NOT EXISTS created_by UUID;

CREATE TABLE IF NOT EXISTS roles (
  id    VARCHAR(30) PRIMARY KEY,
  label VARCHAR(60) NOT NULL
);
CREATE TABLE IF NOT EXISTS permissions (
  id          VARCHAR(40) PRIMARY KEY,
  description VARCHAR(200) NOT NULL
);
CREATE TABLE IF NOT EXISTS role_permissions (
  role_id       VARCHAR(30) NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id VARCHAR(40) NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS reason VARCHAR(500);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS ip VARCHAR(64);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs (created_at DESC);

CREATE TABLE IF NOT EXISTS moderation_actions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id   UUID NOT NULL REFERENCES admins(id),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action     VARCHAR(20) NOT NULL CHECK (action IN ('warn','suspend','reactivate','ban','anonymize','hide_message','reset_password')),
  reason     VARCHAR(500) NOT NULL,
  until      TIMESTAMPTZ,
  report_id  UUID REFERENCES reports(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_moderation_user ON moderation_actions (user_id, created_at DESC);

-- ── Analytics ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS analytics_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name VARCHAR(40) NOT NULL,
  user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  game_id    VARCHAR(20),
  match_id   UUID,
  properties JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_analytics_name_time ON analytics_events (event_name, created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_user_time ON analytics_events (user_id, created_at);

-- Sessions de connexion temps réel (temps de session, joueurs connectés).
CREATE TABLE IF NOT EXISTS presence_sessions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_presence_user ON presence_sessions (user_id, started_at);

CREATE TABLE IF NOT EXISTS daily_user_stats (
  stat_date    DATE NOT NULL,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  matches      INT NOT NULL DEFAULT 0,
  wins         INT NOT NULL DEFAULT 0,
  play_time_ms BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (stat_date, user_id)
);

CREATE TABLE IF NOT EXISTS daily_game_stats (
  stat_date          DATE NOT NULL,
  game_id            VARCHAR(20) NOT NULL REFERENCES games(id),
  matches_completed  INT NOT NULL DEFAULT 0,
  matches_cancelled  INT NOT NULL DEFAULT 0,
  play_time_ms       BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (stat_date, game_id)
);

CREATE TABLE IF NOT EXISTS retention_cohorts (
  cohort_date    DATE NOT NULL,
  day_offset     INT NOT NULL,
  cohort_size    INT NOT NULL,
  retained_users INT NOT NULL,
  computed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (cohort_date, day_offset)
);

-- ── Tournois ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tournaments (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id            VARCHAR(20) NOT NULL REFERENCES games(id),
  name               VARCHAR(100) NOT NULL,
  description        TEXT,
  format             VARCHAR(30) NOT NULL CHECK (format IN ('single_elimination','round_robin')),
  status             VARCHAR(20) NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft','registration','in_progress','completed','cancelled')),
  starts_at          TIMESTAMPTZ NOT NULL,
  ends_at            TIMESTAMPTZ NOT NULL,
  max_participants   INT NOT NULL DEFAULT 16,
  players_per_match  INT NOT NULL DEFAULT 2,
  rules              JSONB NOT NULL DEFAULT '{}'::jsonb,
  invite_only        BOOLEAN NOT NULL DEFAULT false,
  created_by         UUID REFERENCES admins(id),
  published_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_at > starts_at)
);

CREATE TABLE IF NOT EXISTS tournament_players (
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seed          INT,
  status        VARCHAR(20) NOT NULL DEFAULT 'registered' CHECK (status IN ('registered','eliminated','withdrawn')),
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tournament_id, user_id)
);

CREATE TABLE IF NOT EXISTS tournament_matches (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  round         INT NOT NULL,
  position      INT NOT NULL,
  player_ids    UUID[] NOT NULL DEFAULT '{}',
  room_id       UUID REFERENCES game_rooms(id),
  match_id      UUID REFERENCES matches(id),
  winner_id     UUID REFERENCES users(id),
  status        VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','ready','in_progress','completed','bye')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tournament_id, round, position)
);

CREATE TABLE IF NOT EXISTS tournament_results (
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rank          INT NOT NULL,
  points        INT NOT NULL DEFAULT 0,
  wins          INT NOT NULL DEFAULT 0,
  PRIMARY KEY (tournament_id, user_id)
);
