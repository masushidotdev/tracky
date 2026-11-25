# Self-hosting di Tracky con Docker

> Preferisci l'inglese? Leggi la [guida in inglese](self-hosting.md).

Avvia Tracky sul tuo server o PC con Docker Compose: l'app TanStack Start collegata a un backend [Convex](https://convex.dev/) self-hosted, senza alcuna telemetria di prodotto.

## Avvio rapido

Prerequisiti: Docker 24+ con Docker Compose v2 e un account gratuito [WorkOS](https://workos.com/) (AuthKit).

```bash
git clone https://github.com/masushidotdev/tracky.git
cd tracky
cp .env.selfhost.example .env
# Modifica .env: imposta INSTANCE_SECRET, WORKOS_CLIENT_ID, WORKOS_API_KEY,
# WORKOS_WEBHOOK_SECRET e WORKOS_COOKIE_PASSWORD
docker compose up -d
```

Apri [http://localhost:3000](http://localhost:3000).

Genera i segreti casuali prima del primo avvio:

```bash
openssl rand -hex 32          # -> INSTANCE_SECRET
openssl rand -base64 32       # -> WORKOS_COOKIE_PASSWORD (almeno 32 caratteri)
echo "whsec_$(openssl rand -hex 16)" # -> segnaposto WORKOS_WEBHOOK_SECRET per uso solo locale
```

Per avviare anche la dashboard Convex opzionale su [http://localhost:6791](http://localhost:6791):

```bash
docker compose --profile dashboard up -d
```

## Cosa gira in container e cosa resta esterno

### Nei container (`docker-compose.yml`)

| Servizio | Immagine / Target | Ruolo |
| --- | --- | --- |
| `backend` | `ghcr.io/convex/convex-backend` (pinnata per digest) | API Convex self-hosted (`3210`), HTTP actions (`3211`) e database SQLite + storage locale nel volume `convex-data`. Espone anche la porta `3000` per `app`. |
| `convex-key` | `ghcr.io/convex/convex-backend` (one-shot) | Deriva la admin key da `INSTANCE_NAME` e `INSTANCE_SECRET` nel volume privato `convex-admin` (`0600`, uid `1000`). |
| `convex-deploy` | `Dockerfile` (`target: deployer`, one-shot) | Sincronizza le variabili d'ambiente Convex consentite e pubblica schema, componenti e funzioni (`convex deploy --yes --skip-workos-check --typecheck=disable`). |
| `app` | `Dockerfile` (`target: runtime`) | Worker Cloudflare TanStack Start eseguito localmente su `workerd` tramite il runtime locale di Wrangler dietro un edge proxy Node integrato sulla porta `3000` (`network_mode: "service:backend"`). Gira come utente non-root `node` (uid `1000`). |
| `dashboard` | `ghcr.io/convex/convex-dashboard` (pinnata per digest, profilo `dashboard`) | Dashboard web Convex opzionale (`6791`). |

### Servizi esterni

- **WorkOS AuthKit (obbligatorio):** Tracky verifica i JWT RS256 di WorkOS tramite `https://api.workos.com/sso/jwks/<WORKOS_CLIENT_ID>` (`convex/auth.config.ts`) e usa `@workos/authkit-tanstack-react-start` per login e cookie di sessione. WorkOS rimane un servizio SaaS esterno (con piano developer gratuito):
  1. Crea un progetto/ambiente su [dashboard.workos.com](https://dashboard.workos.com/).
  2. In **Redirects**, aggiungi `http://localhost:3000/callback` (oppure `https://<tuo-dominio>/callback` in produzione).
  3. Copia `WORKOS_CLIENT_ID` e `WORKOS_API_KEY` nel file `.env`.
  4. Imposta `WORKOS_WEBHOOK_SECRET`: `@convex-dev/workos-authkit` richiede questa variabile durante il push delle funzioni Convex. Dietro un reverse proxy HTTPS pubblico, crea un webhook WorkOS verso `https://<tuo-convex-site>/workos/webhook` (eventi `user.created`, `user.updated`, `user.deleted`) e incolla il signing secret. In ambiente locale solo HTTP (dove WorkOS non può raggiungere il tuo host), un valore casuale `whsec_...` permette il deploy del backend e il primo accesso sincronizza comunque il profilo utente.
- **Integrazioni opzionali** (tutte disattivate finché le rispettive variabili non sono valorizzate in `.env` e sincronizzate su Convex):
  - **Enable Banking:** app ID, chiave privata PEM e URL di callback HTTPS del tuo account Enable Banking (`ENABLE_BANKING_*`).
  - **Analyst AI:** imposta `VITE_ANALYST_ENABLED=true` (richiede il rebuild di `app`) più `AI_GATEWAY_API_KEY` / `OPENROUTER_API_KEY` (e opzionalmente `LANGFUSE_*`).
  - **Report email (Resend):** `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_WEBHOOK_SECRET`.
  - **Bot Telegram:** `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_WEBHOOK_URL`.

## Note di configurazione

- **Variabili build-time vs. runtime:** `VITE_CONVEX_URL`, `VITE_ANALYST_ENABLED` e `APP_PUBLIC_URL` vengono incorporati nel bundle durante `docker compose build`. I segreti runtime (`WORKOS_*`) non sono mai inclusi nell'immagine: `docker/entrypoint.sh` scrive un file `.dev.vars` (`0600`) da allowlist a ogni avvio del container.
- **Perché `app` e `convex-deploy` condividono il namespace di rete di `backend`:** `src/router.tsx` usa `VITE_CONVEX_URL` sia nel browser sia durante il rendering SSR. Con `network_mode: "service:backend"` (e porta `3000` pubblicata su `backend`), `http://127.0.0.1:3210` funziona in modo identico in entrambi i contesti e `convex-deploy` raggiunge Convex su loopback senza dipendere dal routing bridge inter-container.
- **Auto-provisioning WorkOS in `convex.json`:** la sezione `authKit` di `convex.json` è pensata per Convex Cloud. Il deploy self-hosted usa `--skip-workos-check` e gestisce esplicitamente le credenziali WorkOS tramite `.env` e `docker/convex-deploy.sh`.

## Esecuzione dietro reverse proxy con TLS

Per esporre Tracky su un dominio pubblico (es. `https://tracky.example.com`, `https://convex.example.com` e `https://convex-site.example.com`):

1. Configura il reverse proxy (Caddy, Nginx, Traefik) per terminare TLS e inoltrare:
   - `tracky.example.com` -> `127.0.0.1:3000`
   - `convex.example.com` -> `127.0.0.1:3210` (con supporto WebSocket / header `Upgrade`)
   - `convex-site.example.com` -> `127.0.0.1:3211` (necessario per i webhook in ingresso: WorkOS, Enable Banking, Resend, Telegram)
2. Aggiorna `.env`:
   ```env
   APP_PUBLIC_URL=tracky.example.com
   WORKOS_REDIRECT_URI=https://tracky.example.com/callback
   VITE_CONVEX_URL=https://convex.example.com
   CONVEX_CLOUD_ORIGIN=https://convex.example.com
   CONVEX_SITE_ORIGIN=https://convex-site.example.com
   NEXT_PUBLIC_DEPLOYMENT_URL=https://convex.example.com
   DO_NOT_REQUIRE_SSL=false
   ```
3. Aggiungi `https://tracky.example.com/callback` tra i Redirect URI di WorkOS (e registra `https://convex-site.example.com/workos/webhook` per `WORKOS_WEBHOOK_SECRET`).
4. Ricostruisci e riavvia per incorporare il nuovo `VITE_CONVEX_URL` nel bundle client:
   ```bash
   docker compose up -d --build
   ```

## Aggiornamento

1. Esegui prima un backup del volume `convex-data` (vedi sotto).
2. Scarica gli aggiornamenti e ricostruisci:
   ```bash
   git pull
   docker compose up -d --build
   ```
   `convex-deploy` viene eseguito automaticamente prima del riavvio di `app`, aggiornando schema/funzioni Convex e variabili d'ambiente consentite.

## Backup e ripristino

Per impostazione predefinita, Convex salva il database SQLite e i file nel volume Docker `convex-data` (`/convex/data`).

**Backup (ferma brevemente `backend` per uno snapshot SQLite coerente):**

```bash
docker compose stop app backend
docker run --rm \
  -v "$(docker compose config --format json | jq -r '.name')_convex-data:/data:ro" \
  -v "$PWD:/backup" \
  debian:bookworm-slim \
  tar czf "/backup/tracky-convex-$(date +%Y%m%d-%H%M%S).tar.gz" -C /data .
docker compose start backend app
```

**Ripristino:**

```bash
docker compose stop app backend
docker run --rm \
  -v "$(docker compose config --format json | jq -r '.name')_convex-data:/data" \
  -v "$PWD:/backup:ro" \
  debian:bookworm-slim \
  sh -c 'rm -rf /data/* && tar xzf /backup/tracky-convex-YYYYMMDD-HHMMSS.tar.gz -C /data'
docker compose up -d
```

Conserva una copia protetta del file `.env` (in particolare `INSTANCE_SECRET`, `INSTANCE_NAME` e `WORKOS_COOKIE_PASSWORD`) insieme ai backup.

## Note di sicurezza

Il container `app` esegue il Cloudflare Worker su `workerd` tramite il runtime locale di Wrangler in ascolto solo su loopback (`127.0.0.1:8787`), protetto da un edge proxy Node integrato sulla porta `3000` che blocca gli endpoint locali di sviluppo `/cdn-cgi/*`. Le porte `3210` e `3211` espongono le API client e le HTTP actions di Convex; le operazioni amministrative richiedono la admin key derivata da `INSTANCE_SECRET`, quindi conserva `INSTANCE_SECRET` (e la admin key generata) in modo rigorosamente riservato. In caso di esposizione su Internet, pubblica tutti gli endpoint dietro un reverse proxy con terminazione TLS e non esporre mai pubblicamente la porta della dashboard Convex (`6791`).

## Limiti e assenza di telemetria

- **Runtime:** Tracky compila come Cloudflare Worker (non esiste un target server Node). L'immagine self-host `app` esegue il Worker localmente su `workerd` tramite il runtime locale pinnato `wrangler dev --local` dietro un edge proxy leggero integrato (`docker/edge.mjs`). È adatta al self-hosting personale o familiare su nodo singolo, non allo scaling orizzontale multi-replica.
- **Storage:** SQLite + storage locale nel volume `convex-data` (nodo singolo). Il backend Convex supporta comunque Postgres (`POSTGRES_URL`), MySQL (`MYSQL_URL`) e bucket S3 tramite le variabili opzionali documentate in `.env.selfhost.example`.
- **Nessuna telemetria:**
  - PostHog è disattivato in modo forzato a build time (`CLOUDFLARE_ENV=selfhost`, `VITE_POSTHOG_ENABLED=false`, nessun host/chiave di raccolta in `dist/client` o `dist/server/wrangler.json`).
  - Il beacon del backend Convex è disabilitato (`DISABLE_BEACON=true`).
  - Telemetria, segnalazioni errori, controlli aggiornamenti del banner, Local Explorer di Wrangler e il fetch iniziale di `workers.cloudflare.com/cf.json` da parte di Miniflare sono disattivati (`WRANGLER_SEND_METRICS=false`, `WRANGLER_SEND_ERROR_REPORTS=false`, `WRANGLER_HIDE_BANNER=true`, `X_LOCAL_EXPLORER=false`, `CLOUDFLARE_CF_FETCH_ENABLED=false`, `DO_NOT_TRACK=1`).
- **Dashboard Convex:** se avvii `--profile dashboard`, ottieni la admin key per accedere con:
  ```bash
  docker compose exec backend ./generate_admin_key.sh
  ```
