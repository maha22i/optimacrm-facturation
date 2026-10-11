#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Reconstruit et redémarre la stack facturation après une mise à jour du code.
#
#   bash /opt/project/optima-facturation/deploy/redeploy.sh
#
# Les migrations sont jouées sous le rôle `postgres` AVANT le redémarrage de
# l'application : le rôle applicatif n'a aucun droit DDL et le backend ne joue
# plus les migrations à son démarrage.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

cd "$(dirname "$0")/.."

docker compose build
docker compose up -d postgres
# -T : sans lui, `run` s'attache à stdin et avale le reste de ce script
# lorsqu'il est exécuté via un pipe ou un heredoc.
docker compose run --rm -T migrate
docker compose up -d

docker compose ps
