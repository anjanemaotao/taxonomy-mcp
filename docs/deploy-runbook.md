# Deploy runbook - taxonomy-mcp

Status: **live** at https://taxonomy.kylelynch.us/mcp (first deployed 2026-07-10).

After the one-time setup below, every deploy is just `git push origin main`.
GitHub Actions runs the tests, SSHes into the droplet, rebuilds the Docker image, and restarts the container.

Important: this droplet does **not** use certbot or Let's Encrypt.
It sits behind Cloudflare and terminates TLS with a Cloudflare Origin Certificate.
Full droplet context (every service, port, SSH steps, common operations) lives in the vault at `Reference/Technical/Droplet Operations Playbook`.

## How a deploy works (automatic, after setup)

`.github/workflows/deploy.yml` runs on every push to `main`:

1. Runs `npm ci`, `npm run typecheck`, `npm test`.
2. If green, SSHes to the droplet (using the three `DROPLET_*` secrets) and runs: clone-if-missing, `git pull origin main`, `docker build -t taxonomy-mcp .`, then restarts the container with `--restart always -p 3004:3002 --memory=192m`.

Host port `3004` maps to container port `3002`.
nginx proxies `taxonomy.kylelynch.us` to `127.0.0.1:3004`.

## One-time setup

This is already done for taxonomy-mcp.
It doubles as the template for the next MCP service on this droplet.

### 1. GitHub repo

Create the **public** repo (the deploy step clones it unauthenticated over HTTPS), then push `main`:

    gh repo create kylelynch/taxonomy-mcp --public --source=. --remote=origin --push

### 2. Actions secrets

Add the three droplet secrets (the same values every droplet repo uses):

- `DROPLET_HOST` = `146.190.122.134`
- `DROPLET_USER` = `deploy`
- `DROPLET_SSH_KEY` = the full contents of the private key `~/.ssh/droplet_deploy`

Set the key without printing it to your screen:

    gh secret set DROPLET_HOST    -R kylelynch/taxonomy-mcp --body "146.190.122.134"
    gh secret set DROPLET_USER    -R kylelynch/taxonomy-mcp --body "deploy"
    gh secret set DROPLET_SSH_KEY -R kylelynch/taxonomy-mcp < ~/.ssh/droplet_deploy

### 3. DNS (Cloudflare)

Add an A record `taxonomy` -> `146.190.122.134`, with **Proxied (orange cloud) ON**.
Because `kylelynch.us` is managed by Cloudflare, the record is proxied, so the hostname resolves to Cloudflare IPs rather than the droplet directly.
That is correct and expected.

### 4. nginx + TLS (on the droplet, needs sudo)

No new certificate is needed.
The existing `*.kylelynch.us` wildcard Cloudflare Origin Certificate (`/etc/ssl/cloudflare/kylelynch-cert.pem`) already covers `taxonomy.kylelynch.us`.

SSH in as `deploy`, then authenticate sudo once first (this avoids the paste-eats-password gotcha below):

    ssh -i ~/.ssh/droplet_deploy deploy@146.190.122.134
    sudo -v

Add the rate-limit zone once (http-level):

    echo 'limit_req_zone $binary_remote_addr zone=taxonomy:10m rate=10r/s;' | sudo tee /etc/nginx/conf.d/ratelimit.conf

Write the site config (reuses the wildcard cert):

    sudo tee /etc/nginx/sites-available/taxonomy.kylelynch.us >/dev/null <<'EOF'
    server {
        listen 80;
        server_name taxonomy.kylelynch.us;
        return 301 https://$host$request_uri;
    }
    server {
        listen 443 ssl;
        server_name taxonomy.kylelynch.us;

        ssl_certificate     /etc/ssl/cloudflare/kylelynch-cert.pem;
        ssl_certificate_key /etc/ssl/cloudflare/kylelynch-key.pem;

        location / {
            limit_req zone=taxonomy burst=20 nodelay;
            proxy_pass http://127.0.0.1:3004;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_set_header mcp-session-id $http_mcp_session_id;
            proxy_buffering off;
            proxy_cache off;
            proxy_read_timeout 300s;
            chunked_transfer_encoding off;
        }
    }
    EOF

Enable, test, reload:

    sudo ln -sf /etc/nginx/sites-available/taxonomy.kylelynch.us /etc/nginx/sites-enabled/taxonomy.kylelynch.us
    sudo nginx -t && sudo systemctl reload nginx

The Cloudflare SSL/TLS mode for the zone is already "Full (strict)" because the other `*.kylelynch.us` sites use it, so there is nothing to change in Cloudflare beyond the DNS record.

### 5. Verify

    curl -s https://taxonomy.kylelynch.us/healthz

Should show `"topics":1590`.

### 6. Connect a client

    claude mcp add --transport http taxonomy https://taxonomy.kylelynch.us/mcp

## Gotcha: pasting sudo and a heredoc together

If you paste a block that contains a `sudo` command AND a heredoc at the same time, the sudo password prompt can swallow some of the pasted lines and leave you stuck at a `>` continuation prompt.
Fix: run `sudo -v` first and enter your password once, THEN paste the rest.
Press Ctrl-C to escape a stuck `>` prompt.
