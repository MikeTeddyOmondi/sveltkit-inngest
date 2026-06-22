# Keycloak — Docker Compose Setup

## `compose.yml`

```yaml
services:
  keycloak:
    image: quay.io/keycloak/keycloak:26.1
    command: start-dev
    environment:
      KC_BOOTSTRAP_ADMIN_USERNAME: admin
      KC_BOOTSTRAP_ADMIN_PASSWORD: admin
      KC_DB: postgres
      KC_DB_URL: jdbc:postgresql://postgres:5432/keycloak
      KC_DB_USERNAME: keycloak
      KC_DB_PASSWORD: keycloak
      KC_HOSTNAME: localhost
      KC_HTTP_PORT: 8080
    ports:
      - "5080:8080"
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped

  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_DB: keycloak
      POSTGRES_USER: keycloak
      POSTGRES_PASSWORD: keycloak
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U keycloak"]
      interval: 5s
      timeout: 5s
      retries: 10
    restart: unless-stopped

volumes:
  postgres_data:
```

```bash
docker compose up -d
```

Keycloak will be available at `http://localhost:5080`.  
Admin console: `http://localhost:5080/admin` → `admin` / `admin`.

---

## Configure the realm + client

### 1. Create a realm

Admin console → top-left dropdown → **Create realm**

| Field | Value |
|---|---|
| Realm name | `locci` |

### 2. Create a client

**Clients** → **Create client**

**General settings**

| Field | Value |
|---|---|
| Client type | `OpenID Connect` |
| Client ID | `locci-auth-demo` |

**Capability config**

| Field | Value |
|---|---|
| Client authentication | `On` |
| Authentication flow | `Standard flow` only |

**Login settings**

| Field | Value |
|---|---|
| Valid redirect URIs | `http://localhost:5173/api/auth/oauth2/callback/keycloak` |
| Web origins | `http://localhost:5173` |

Save → go to **Credentials** tab → copy the **Client secret**.

### 3. Update your `.env`

```env
KEYCLOAK_ISSUER=http://localhost:5080/realms/locci
KEYCLOAK_CLIENT_ID=locci-auth
KEYCLOAK_CLIENT_SECRET=<paste secret here>
```

### 4. Create a test user

**Users** → **Add user**

| Field | Value |
|---|---|
| Username | `testuser` |
| Email | `test@locci.cloud` |
| Email verified | `On` |
| First name | `Test` |
| Last name | `User` |

Then **Credentials** tab → **Set password** → turn `Temporary` off.

---

## Custom login themes (Locci brand)

Two custom login themes ship in [`keycloak/themes/`](../keycloak/themes/), styled to match
the SvelteKit app (paper/ink/accent palette, **Syne** + **DM Mono** fonts):

| Theme | Look |
|---|---|
| `locci` | Simple single centred card (white card, traffic-light header, dark button). |
| `locci-split` | Full **split-screen** — dark hero panel (LOCCI brand + tagline + tech pills) on the left, card on the right. Mirrors the app's `/` login page. |

Both inherit Keycloak's `keycloak.v2` theme (PatternFly v5). `locci` is CSS-only;
`locci-split` also overrides `login/template.ftl` to inject the hero panel.

### How they're wired

- [compose.yaml](../compose.yaml) mounts the whole themes dir read-only:
  `./keycloak/themes:/opt/keycloak/themes:ro`
- The realm's **Login theme** selects which one is used.

### Switch the active theme

Admin console → **Realm settings** → **Themes** → **Login theme** → pick `locci` or
`locci-split` → **Save**. Or via CLI:

```bash
docker exec locci-auth-keycloak /opt/keycloak/bin/kcadm.sh config credentials \
  --server http://localhost:8080 --realm master --user admin --password admin
docker exec locci-auth-keycloak /opt/keycloak/bin/kcadm.sh update realms/locci \
  -s loginTheme=locci-split   # or: locci
```

### Editing / iterating

- `start-dev` disables theme caching, so editing the CSS/template and **reloading the
  browser** shows changes immediately — no restart.
- Adding or removing a theme *folder* requires recreating the container
  (`docker compose up -d keycloak`) so Keycloak rediscovers it.
- **Production** (`start`, not `start-dev`) caches themes. Either bake the theme dir into
  your Keycloak image, or set `KC_SPI_THEME_CACHE_THEMES=false` (staging only), and
  restart after deploys.

---

## Notes

- `start-dev` disables HTTPS requirements — fine for local dev, never use in production.
- For production use `start` with a reverse proxy (Traefik/Nginx) handling TLS and set `KC_HOSTNAME` to your public domain.
- Postgres data persists in the `postgres_data` named volume across restarts. To reset completely: `docker compose down -v`.
