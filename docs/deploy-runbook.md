# Deploy runbook - taxonomy-mcp

Everything below is a one-time manual step; after it, deploy is `git push origin main`.

## 1. GitHub repo

Create the public repo `kylelynch/taxonomy-mcp`, then rename the local branch to main and push:
`git branch -M main && git remote add origin git@github.com:kylelynch/taxonomy-mcp.git && git push -u origin main`.

## 2. Actions secrets

Add the three droplet secrets used by every repo that deploys there (same values as keeper-mcp):
`DROPLET_HOST`, `DROPLET_USER`, `DROPLET_SSH_KEY`.

## 3. DNS

Add an A record: `taxonomy.kylelynch.us` -> droplet IP.

## 4. nginx (sudo, on the droplet)

Add the rate-limit zone once in the `http` block (for example in `/etc/nginx/conf.d/ratelimit.conf`):

    limit_req_zone $binary_remote_addr zone=taxonomy:10m rate=10r/s;

Add the server block (for example `/etc/nginx/sites-available/taxonomy.kylelynch.us`, then symlink into `sites-enabled`):

    server {
        server_name taxonomy.kylelynch.us;
        listen 80;

        location / {
            limit_req zone=taxonomy burst=20 nodelay;
            proxy_pass http://127.0.0.1:3004;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_buffering off;
            proxy_read_timeout 300s;
        }
    }

Then: `sudo nginx -t && sudo systemctl reload nginx`.

## 5. TLS

`sudo certbot --nginx -d taxonomy.kylelynch.us`.

## 6. First deploy and verify

Push to main (or run the Deploy workflow manually), then:
`curl -s https://taxonomy.kylelynch.us/healthz` shows `"topics":1590`.

## 7. Connect a client

`claude mcp add --transport http taxonomy https://taxonomy.kylelynch.us/mcp`.
