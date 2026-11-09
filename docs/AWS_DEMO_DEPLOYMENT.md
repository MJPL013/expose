# EC2 demo delivery

10 November 2026, B073. Deployment preparation only; no instance or public application is running yet.

## Source of the deployed application

The deployment branch is `ec2` in `https://github.com/MJPL013/expose`. Its initial application snapshot has `main` as its parent and includes the current working application, including changes not previously committed on `v2`. The local `v2` checkout is preserved. This is an application snapshot, not a merge of the old `v1` history.

Deployment will fetch this branch and check out a specific reviewed commit. EC2 will install dependencies and build on Linux from that commit. Updates must use a new reviewed commit; publishing to GitHub alone does not deploy or restart the server. Keep the last deployed commit recorded for rollback; database migrations need a separate backup and compatibility review.

Only source, required application assets, migrations, configuration examples and documentation belong in the branch. Actual environment files, credentials, database files, recordings, generated builds, dependency folders and unrelated video-production assets are excluded. Historical film/evidence links in documentation may refer to local-only files.

## Proposed single-instance layout

Browser HTTPS/WSS -> Caddy on 443 -> existing application proxy on loopback 3000 -> Next.js on 3001 or Fastify on 4000. Fastify connects to local PostgreSQL and calls Gnani/Gemini/DeepSeek using server-side credentials. PostgreSQL also holds durable jobs. Database and application ports must remain private.

The draft [CloudFormation template](../deploy/aws/ec2-demo.json) proposes an Amazon Linux 2023 instance in Mumbai, an Elastic IP, inbound 80/443, SSM administration, IMDSv2, an encrypted 16 GiB root disk and a separate retained 20 GiB data disk. The default `t3.medium` and alternative `t3.small` are proposals pending cost/runtime selection. T3 standard credits avoid surplus-credit charges but can throttle sustained CPU use.

The draft hostname is `expose.<elastic-ip>.sslip.io`. HTTPS is not available until DNS, Caddy and certificate issuance have been verified. No Route 53 zone or purchased domain is required for this proposal. A retained Elastic IP keeps that hostname stable.

Use a fresh demo database unless importing local data is explicitly requested. Store PostgreSQL and private media on persistent storage outside release checkouts. Never copy the local development database password into production. Server configuration and provider credentials are provisioned separately from Git, never embedded in the template or browser bundle. The credential provisioning method is still pending deployment review.

## Outstanding launch work

- Verify the template, Mumbai availability/quotas and current itemised pricing; choose runtime/cost before creating resources.
- Provision infrastructure, mount persistent storage safely, install services and configure protected server secrets.
- Fetch an exact `ec2` commit, install/build, back up before migrations and configure service restart behaviour.
- Configure the public origin, secure cookies, narrowly trusted reverse proxy, rate limits and demo indexing policy.
- Verify HTTPS, WebSockets, microphone permission, restart persistence and a physical PC/phone match and Void conversation.

The template is not a complete application installer. No deployment, certificate issuance, Linux build or physical/provider acceptance is claimed by publishing this branch. Existing dated verification and known failures remain in [status](STATUS.md).

Stopping an instance does not stop all costs: allocated public IPv4 and EBS storage remain chargeable. The data volume has a retain policy and survives stack deletion; removing it requires a deliberate separate cleanup after deciding whether its data is needed. LLM and speech charges are separate from EC2.
