#!/bin/sh
# ─────────────────────────────────────────────────────────────────────────────
# Exécuté une seule fois, à l'initialisation d'un volume de données vierge.
#
# Crée le rôle applicatif `optimacrm_app` attendu par le backend. Ce rôle n'est
# volontairement PAS propriétaire des tables et n'a aucun droit DDL : comme les
# tables sont en FORCE ROW LEVEL SECURITY, un propriétaire serait lui aussi
# soumis aux policies, et un superuser les contournerait toutes. Le cloisonnement
# multi-tenant repose donc sur ce rôle restreint.
#
# ALTER DEFAULT PRIVILEGES accorde le DML à l'avance sur les tables que les
# migrations (jouées sous `postgres`) créeront ensuite.
# ─────────────────────────────────────────────────────────────────────────────
set -e

psql -v ON_ERROR_STOP=1 \
     --username "$POSTGRES_USER" \
     --dbname "$POSTGRES_DB" \
     --set=app_password="$APP_DB_PASSWORD" <<'EOSQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'optimacrm_app') THEN
    CREATE ROLE optimacrm_app LOGIN;
  END IF;
END
$$;

ALTER ROLE optimacrm_app PASSWORD :'app_password';

GRANT CONNECT ON DATABASE optimacrm TO optimacrm_app;
GRANT USAGE ON SCHEMA public TO optimacrm_app;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO optimacrm_app;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO optimacrm_app;
EOSQL
