-- Réinitialisation du mot de passe par e-mail (remplace l'OTP par SMS).
-- Migration additive : la table otp_codes n'est plus utilisée mais n'est pas supprimée.

ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(254);
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_lower ON users (LOWER(email)) WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   CHAR(64) NOT NULL UNIQUE,           -- SHA-256 du jeton (le jeton lui-même n'est jamais stocké)
  expires_at   TIMESTAMPTZ NOT NULL,
  used_at      TIMESTAMPTZ,
  requested_ip VARCHAR(64),
  created_by_admin UUID REFERENCES admins(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reset_tokens_user ON password_reset_tokens (user_id, created_at DESC);
