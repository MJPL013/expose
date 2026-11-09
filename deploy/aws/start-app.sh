#!/bin/bash
# Run after editing /etc/expose/backend.env. Never echo its contents.
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Run with sudo.'; exit 1; }
test -s /etc/expose/backend.env
chown root:expose /etc/expose/backend.env
chmod 0640 /etc/expose/backend.env
cd /opt/expose/app
runuser -u expose -- node --env-file=/etc/expose/backend.env --input-type=module - <<'JS'
const p = process.env;
if (!p.PUBLIC_ORIGIN?.startsWith('https://') || p.ALLOWED_ORIGINS !== p.PUBLIC_ORIGIN || p.COOKIE_SECURE !== 'true') throw Error('Set HTTPS PUBLIC_ORIGIN, matching ALLOWED_ORIGINS and COOKIE_SECURE=true.');
if (!p.DATABASE_URL?.includes('/var/run/postgresql')) throw Error('Use the installed local Unix-socket database configuration.');
if (p.GC2_LOCAL_TESTING === 'true') throw Error('Local authentication bypass must stay disabled.');
if (p.AI_ENABLED === 'true' && !p.GNANI_API_KEY) throw Error('Add the Gnani key or set AI_ENABLED=false.');
console.log('Required deployment configuration checked; values not printed.');
JS
runuser -u expose -- npm run db:migrate
systemctl enable expose
systemctl restart expose
for attempt in {1..30}; do
  if curl --fail --silent http://127.0.0.1:4000/api/v1/health >/dev/null; then
    echo 'Expose backend is responding. Open the HTTPS hostname.'
    exit 0
  fi
  sleep 2
done
echo 'Startup check failed. Inspect: sudo journalctl -u expose -n 60 --no-pager'
exit 1
