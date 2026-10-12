-- Récupération de compte sans e-mail : le joueur laisse son numéro et l'adresse
-- où recevoir le lien ; un agent vérifie son identité (rappel du numéro Yas)
-- puis envoie le lien depuis le back-office. Une seule demande en attente par compte.

CREATE TABLE IF NOT EXISTS recovery_requests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email        VARCHAR(254) NOT NULL,
  note         VARCHAR(300),
  status       VARCHAR(12) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'rejected')),
  requested_ip VARCHAR(64),
  handled_by   UUID REFERENCES admins(id),
  handled_at   TIMESTAMPTZ,
  admin_note   VARCHAR(300),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_recovery_pending ON recovery_requests (user_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_recovery_status ON recovery_requests (status, created_at DESC);
