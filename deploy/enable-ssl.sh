#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Émet les certificats Let's Encrypt des trois sous-domaines de la stack et
# active la redirection HTTP → HTTPS.
#
# À lancer sur le VPS UNE FOIS les enregistrements DNS A propagés : la
# validation http-01 exige que chaque sous-domaine résolve déjà vers ce serveur.
#
#   bash /opt/project/optima-facturation/deploy/enable-ssl.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

DOMAINS=(
  facturationgroupinnov.optimacrm.fr
  clientgroupinnov.optimacrm.fr
  backend-facturation.optimacrm.fr
)

SERVER_IP="$(curl -fsS https://api.ipify.org)"
echo "IP publique du serveur : ${SERVER_IP}"

# Un certificat par domaine (comme les vhosts existants) : une erreur sur un
# sous-domaine n'invalide pas la demande des deux autres.
for domain in "${DOMAINS[@]}"; do
  resolved="$(getent hosts "$domain" | awk '{print $1}' | head -1 || true)"
  if [ -z "$resolved" ]; then
    echo "✗ ${domain} ne résout pas encore — enregistrement DNS A manquant. Abandon."
    exit 1
  fi
  if [ "$resolved" != "$SERVER_IP" ]; then
    echo "✗ ${domain} résout vers ${resolved} au lieu de ${SERVER_IP}. Abandon."
    exit 1
  fi
  echo "✓ ${domain} → ${resolved}"
done

for domain in "${DOMAINS[@]}"; do
  echo "── Certificat pour ${domain}"
  certbot --nginx --non-interactive --agree-tos --redirect \
          --cert-name "$domain" -d "$domain"
done

nginx -t
systemctl reload nginx
echo "✓ HTTPS actif sur les trois sous-domaines"
