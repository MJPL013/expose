#!/bin/bash
# Fresh Amazon Linux 2023 host only. Fetch application code from GitHub.
# Usage: sudo bash prepare-instance.sh HOSTNAME DATA_VOLUME_ID COMMIT
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Run with sudo.'; exit 1; }
hostname=${1:?hostname required}
volume=${2:?retained volume ID required}
commit=${3:?full Git commit required}
[[ $hostname =~ ^[a-zA-Z0-9.-]+$ && $volume =~ ^vol-[a-f0-9]+$ && $commit =~ ^[a-f0-9]{40}$ ]] || exit 1
if systemctl is-active --quiet expose; then echo 'Application already running; use the update runbook.'; exit 1; fi
dnf install -y git nano nodejs22 nodejs22-npm postgresql17 postgresql17-server nvme-cli
node --version
npm --version
id expose >/dev/null 2>&1 || useradd --system --create-home --home-dir /opt/expose --shell /sbin/nologin expose
chown expose:expose /opt/expose
id caddy >/dev/null 2>&1 || useradd --system --home-dir /srv/expose/caddy --shell /sbin/nologin caddy

# Resolve the exact EBS serial, never rely on an NVMe device index.
serial=${volume//-/}
device=$(lsblk -dn -o PATH,SERIAL | awk -v serial="$serial" '$2==serial {print $1}')
[[ -n $device && $(echo "$device" | wc -l) -eq 1 ]] || { echo 'Expected data volume not found.'; exit 1; }
[[ $(lsblk -nr -o TYPE "$device" | wc -l) -eq 1 ]] || { echo 'Partitioned volume requires manual review.'; exit 1; }
fstype=$(blkid -s TYPE -o value "$device" || true)
if [[ -z $fstype ]]; then
  [[ -z $(wipefs -n --noheadings "$device") ]] || { echo 'Unknown disk signature; refusing to format.'; exit 1; }
  mkfs.ext4 "$device"
elif [[ $fstype != ext4 ]]; then
  echo 'Existing filesystem requires manual review; refusing to format.'; exit 1
fi
uuid=$(blkid -s UUID -o value "$device")
mkdir -p /srv/expose
if mountpoint -q /srv/expose; then
  [[ $(findmnt -n -o UUID --target /srv/expose) == "$uuid" ]] || { echo 'Wrong mounted volume.'; exit 1; }
else
  [[ -z $(ls -A /srv/expose) ]] || { echo 'Mount point is not empty.'; exit 1; }
  mount "UUID=$uuid" /srv/expose
fi
grep -q "^UUID=$uuid " /etc/fstab || printf 'UUID=%s /srv/expose ext4 defaults 0 2\n' "$uuid" >> /etc/fstab
install -d -o expose -g expose -m 0700 /srv/expose/media /srv/expose/gc2 /srv/expose/state
install -d -o postgres -g postgres -m 0700 /srv/expose/postgres
install -d -o caddy -g caddy -m 0700 /srv/expose/caddy
install -d -o root -g expose -m 0750 /etc/expose

# Swap is on the replaceable encrypted root disk, not the recording volume.
if [[ ! -f /swapfile ]]; then
  fallocate -l 4G /swapfile
  chmod 0600 /swapfile
  mkswap /swapfile
fi
swapon --show=NAME --noheadings | grep -qx /swapfile || swapon /swapfile
grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab

if [[ ! -f /srv/expose/postgres/PG_VERSION ]]; then
  [[ -z $(ls -A /srv/expose/postgres) ]] || { echo 'Nonempty PostgreSQL directory; stop.'; exit 1; }
  runuser -u postgres -- initdb -D /srv/expose/postgres --auth-local=peer --auth-host=scram-sha-256
  printf "\nlisten_addresses = ''\nunix_socket_directories = '/var/run/postgresql'\n" >> /srv/expose/postgres/postgresql.conf
fi
mkdir -p /etc/systemd/system/postgresql.service.d
cat > /etc/systemd/system/postgresql.service.d/expose.conf <<'UNIT'
[Unit]
RequiresMountsFor=/srv/expose
[Service]
Environment=PGDATA=/srv/expose/postgres
UNIT
systemctl daemon-reload
systemctl enable --now postgresql
if ! runuser -u postgres -- psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='expose'" | grep -qx 1; then
  runuser -u postgres -- createuser expose
fi
if ! runuser -u postgres -- psql -tAc "SELECT 1 FROM pg_database WHERE datname='expose'" | grep -qx 1; then
  runuser -u postgres -- createdb -O expose expose
fi

if [[ ! -d /opt/expose/app/.git ]]; then
  runuser -u expose -- git clone --branch ec2 --single-branch https://github.com/MJPL013/expose.git /opt/expose/app
fi
runuser -u expose -- git -C /opt/expose/app fetch origin ec2
runuser -u expose -- git -C /opt/expose/app merge-base --is-ancestor "$commit" origin/ec2
runuser -u expose -- git -C /opt/expose/app checkout --detach "$commit"
if [[ -e /opt/expose/app/backend/.env && ! -L /opt/expose/app/backend/.env ]]; then
  echo 'Existing backend env requires manual review.'; exit 1
fi
ln -sfn /etc/expose/backend.env /opt/expose/app/backend/.env

# This is a template only. The user creates backend.env and fills their own keys.
if [[ ! -e /etc/expose/backend.env ]]; then
  python3 - "$hostname" <<'PY'
from pathlib import Path
import sys
values = {
 'DATABASE_URL':'postgresql://expose@localhost/expose?host=/var/run/postgresql',
 'PUBLIC_ORIGIN':'https://'+sys.argv[1], 'ALLOWED_ORIGINS':'https://'+sys.argv[1],
 'COOKIE_SECURE':'true', 'TRUST_PROXY_LOOPBACK':'true',
 'MEDIA_ROOT':'/srv/expose/media', 'GC2_MEDIA_ROOT':'/srv/expose/gc2',
 'AI_STOP_FILE':'/srv/expose/state/ai-stopped', 'AI_ENABLED':'false',
 'HOST_LLM_PROVIDER':'gemini', 'AI_PROFILE':'full-match'
}
lines=Path('/opt/expose/app/backend/.env.example').read_text().splitlines()
seen=set(); out=[]
for line in lines:
 key=line.partition('=')[0]
 if key in values: out.append(key+'='+values[key]); seen.add(key)
 else: out.append(line)
out.extend(k+'='+v for k,v in values.items() if k not in seen)
Path('/etc/expose/backend.env.template').write_text('\n'.join(out)+'\n')
PY
  chown root:expose /etc/expose/backend.env.template
  chmod 0640 /etc/expose/backend.env.template
fi

# Official release, pinned and checksum verified.
archive=$(mktemp)
curl -fsSL --retry 3 https://github.com/caddyserver/caddy/releases/download/v2.11.9/caddy_2.11.9_linux_amd64.tar.gz -o "$archive"
echo "5b8cb7faf8726a2028ad96a66e54e6e81e8f361bc6175e5d22bbd997cc5177fb  $archive" | sha256sum -c -
tar -xzf "$archive" -C /usr/local/bin caddy
chmod 0755 /usr/local/bin/caddy
rm -f "$archive"
mkdir -p /etc/caddy
cat > /etc/caddy/Caddyfile <<CADDY
$hostname {
    header X-Robots-Tag "noindex, nofollow, noarchive"
    header X-Content-Type-Options "nosniff"
    handle /robots.txt {
        respond "User-agent: *
Disallow: /" 200
    }
    handle {
        reverse_proxy 127.0.0.1:3000
    }
}
CADDY
install -m 0644 /opt/expose/app/deploy/aws/caddy.service /etc/systemd/system/caddy.service
install -m 0644 /opt/expose/app/deploy/aws/expose.service /etc/systemd/system/expose.service
systemctl daemon-reload
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
systemctl enable --now caddy

cd /opt/expose/app
runuser -u expose -- npm ci --no-audit --no-fund
runuser -u expose -- env NODE_OPTIONS=--max-old-space-size=1536 NEXT_TELEMETRY_DISABLED=1 npm run build
echo 'Prepared. Application remains stopped. Create /etc/expose/backend.env from the template, edit keys, then run deploy/aws/start-app.sh with sudo.'
