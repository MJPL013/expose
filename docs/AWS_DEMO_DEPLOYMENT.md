# Run Expose on EC2

## Current demo

- Region: **Mumbai (`ap-south-1`)**. CloudFormation stack: `expose-demo`.
- Instance: **`i-0a62669d2d9bd436a`**, `t3.small`, Amazon Linux 2023, 2 GB RAM.
- URL: **https://expose.16.4.114.12.sslip.io** (application starts after configuration).
- Source: [GitHub `ec2`](https://github.com/MJPL013/expose/tree/ec2). Releases use an exact commit.
- Application: `/opt/expose/app`. Secrets: `/etc/expose/backend.env`, outside Git.

## 1. Connect to the server

In the AWS console select **Mumbai → EC2 → Instances → expose-demo-server → Connect → Session Manager → Connect**. No SSH key or open port 22 is needed. All commands below run in that server terminal, not Windows.

## 2. Create your configuration

After server preparation completes, copy the template **once**:

```bash
sudo test ! -e /etc/expose/backend.env && sudo install -o root -g expose -m 0640 /etc/expose/backend.env.template /etc/expose/backend.env
sudo nano /etc/expose/backend.env
```

Keep the supplied database URL, HTTPS origin, media paths, `COOKIE_SECURE=true` and `TRUST_PROXY_LOOPBACK=true`. Set:

```dotenv
AI_ENABLED=true
GNANI_API_KEY=your-key
HOST_LLM_PROVIDER=gemini
GEMINI_API_KEY=your-key
DEEPSEEK_API_KEY=your-key
```

Default Void conversation uses Gemini; background analysis uses DeepSeek; embeddings use Gemini. Add both providers for that complete flow, or deliberately configure the supported conversation/analysis roles. Google keys are optional for guest testing. Keep `GC2_LOCAL_TESTING=false`. Leave `AI_ENABLED=false` if intentionally testing without paid AI.

Save in nano with **Ctrl+O, Enter, Ctrl+X**. Do not paste keys into chat, GitHub, shell commands or logs. The backend reads this file through its `.env` symlink; it is not served by the website.

## 3. Start Expose

```bash
sudo bash /opt/expose/app/deploy/aws/start-app.sh
```

This checks required deployment settings, applies database migrations and starts/restarts the app. Open the HTTPS URL on your PC and phone. Allow microphone access. The service is enabled for reboot after this step.

```bash
sudo systemctl status expose --no-pager
sudo journalctl -u expose -n 60 --no-pager
sudo systemctl restart expose
```

Do not publish logs without reviewing them for private information. If HTTPS fails, inspect `sudo journalctl -u caddy -n 40 --no-pager`.

## Where things live

| Item | Location |
| --- | --- |
| Source and build | `/opt/expose/app` |
| Server configuration | `/etc/expose/backend.env` |
| PostgreSQL data | `/srv/expose/postgres` |
| Void recordings | `/srv/expose/gc2` |
| Game media | `/srv/expose/media` |
| HTTPS certificates | `/srv/expose/caddy` |

Browser HTTPS/WSS → Caddy → loopback proxy `3000` → Next.js `3001` or Fastify `4000` → PostgreSQL/local jobs and external AI APIs. PostgreSQL uses a private Unix socket and Linux peer authentication as `expose`; it has no public TCP listener or database password to copy. The data disk is encrypted and separate from the code/root disk. Local PC data is not imported.

## Update from GitHub

Push reviewed changes to `ec2` first. In the server terminal, record `git rev-parse HEAD`, then stop the app, back up its database and media, and check out the chosen **full commit hash**:

```bash
cd /opt/expose/app
sudo systemctl stop expose
sudo -u expose git fetch origin ec2
sudo -u expose git checkout --detach FULL_COMMIT_HASH
sudo -u expose npm ci --no-audit --no-fund
sudo -u expose env NODE_OPTIONS=--max-old-space-size=1536 npm run build
sudo bash deploy/aws/start-app.sh
```

Use a fresh backup before migrations. Code rollback does not undo database migrations. A failed build leaves the service stopped; do not continue until it succeeds. The existing `.env` and data stay outside Git.

## Cost and stopping

AWS list prices checked 10 November 2026: instance **$0.0224/hour**, public IPv4 **$0.005/hour**, 36 GB gp3 storage **$3.28/month**. At 730 hours: approximately **$23.29/month**, excluding taxes, transfer, backups and AI providers. Credit balance/eligibility is not verified; this is not a hard spending cap.

Stop the instance in the EC2 console when unused. Storage and the allocated IP still cost approximately **$6.93/month** at 730 hours. Start it again to retain the same hostname. To retire the deployment, delete the CloudFormation stack deliberately; its data volume is retained and continues billing until separately backed up/deleted. Do not delete the data disk merely to stop the server.

## Rebuild the infrastructure

[ec2-demo.json](../deploy/aws/ec2-demo.json) defines the instance, SSM role, encrypted disks, stable IP and public 80/443 ingress. No ALB, NAT gateway, RDS or Route 53 zone is used. After creating a new stack, obtain its hostname/data-volume outputs, fetch the reviewed `ec2` source and run:

```bash
sudo bash deploy/aws/prepare-instance.sh HOSTNAME DATA_VOLUME_ID FULL_COMMIT_HASH
```

The preparation script identifies the exact EBS volume, refuses unknown disk contents, installs Node/PostgreSQL and checksum-pinned Caddy, configures persistence, adds 4 GB swap and builds the pinned source. It leaves Expose stopped for manual `.env` setup. It is for a fresh host; use the update steps for an existing deployment. The free IP-derived hostname depends on the external DNS provider and successful certificate issuance.

## Verification

Infrastructure creation and SSM access verified on 10 November 2026. Installation/build/HTTPS results are recorded in [status](STATUS.md) as they complete. AWS template validation and change-set review passed; local cfn-lint/cfn-guard checks were not run. Live AI, microphone quality, PC/phone play and restore drills remain separate acceptance work. Historical test failures remain documented; this deployment does not certify the full suite.
