# Genel Yapı (repo kökü)

```
PingPulse/
├── package.json
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
├── docker-compose.yml
├── .env.example
├── .gitignore
├── .gitattributes
├── .dockerignore
├── PLAN.md
├── docs/
└── services/
    ├── auth/
    └── monitoring/
```

| Dosya | Ne yapar |
|---|---|
| `package.json` | Kök paket. `pnpm build` ve `pnpm test` komutlarını (`-r` ile) bütün servislerde çalıştırır. `packageManager` alanı herkesin aynı pnpm sürümünü (12.9.1) kullanmasını sağlar. `private: true` yanlışlıkla npm'e yayınlanmayı engeller. |
| `pnpm-workspace.yaml` | `services/*` altındaki her klasörü ayrı bir paket olarak tanımlar. `allowBuilds` kurulum sırasında script çalıştırmasına izin verilen paketleri listeler (bcrypt native modülünü derler, Prisma motorunu indirir). pnpm diğer paketlerin script'lerini güvenlik için çalıştırmaz. |
| `pnpm-lock.yaml` | Her paketin tam sürümü. Git'e commit edilir; Docker build `--frozen-lockfile` ile bu dosyaya birebir uyar. |
| `docker-compose.yml` | Bütün sistemi tek komutla ayağa kaldırır (aşağıda). |
| `.env.example` | Ayarlanabilecek ortam değişkenlerinin listesi. Secret'lar boştur; `.env` olarak kopyalanıp doldurulur. |
| `.gitignore` | `node_modules`, `dist`, Prisma'nın ürettiği `src/generated` ve `.env` git'e girmez. `.env.example` istisnadır. |
| `.gitattributes` | Bütün metin dosyaları LF satır sonuyla saklanır. Windows'ta CRLF ile kaydedilen bir shell script Linux container'ında çalışmaz. |
| `.dockerignore` | Yerel `node_modules`, `dist` ve `.env` Docker build'e gönderilmez; imaj kendi bağımlılıklarını kurar ve kendi derlemesini yapar. |

## docker-compose.yml

| Servis | İmaj | Port (host) | Bekler |
|---|---|---|---|
| `postgres` | `postgres:16` | 127.0.0.1:5433 | – |
| `mongo` | `mongo:7.0` | 127.0.0.1:27018 | – |
| `auth` | `services/auth/Dockerfile` | 127.0.0.1:3001 | postgres sağlıklı |
| `monitoring-api` | `services/monitoring/Dockerfile` | 127.0.0.1:3002 | mongo sağlıklı |
| `monitoring-worker` | `services/monitoring/Dockerfile` (komut: `node dist/worker.js`) | – | monitoring-api sağlıklı |

**Kararlar:**
- **Secret'lar zorunlu:** `POSTGRES_PASSWORD`, `JWT_SECRET` ve `INTERNAL_TOKEN` için `${VAR:?...}` sözdizimi kullanılır. `.env` dosyası yoksa ya da değer boşsa compose açık bir hata mesajıyla durur.
- **Host portları standart dışı (5433, 27018):** Makinede yerel bir Postgres ya da MongoDB varsa çakışmasın. Servisler veritabanlarına Docker iç ağından (`postgres:5432`, `mongo:27017`) bağlanır; host portları sadece geliştiricinin veritabanına bakabilmesi içindir. `127.0.0.1` ile sadece yerel makineden erişilebilir.
- **Healthcheck'ler:** Bir servis, bağımlı olduğu servis gerçekten hazır olmadan başlamaz (`depends_on: condition: service_healthy`).
  - Postgres: `pg_isready -h 127.0.0.1`. `-h` ile TCP üzerinden kontrol edilir; Postgres ilk kurulumda geçici bir sunucuyu sadece Unix socket ile açar ve `-h` olmazsa o geçici sunucu "sağlıklı" görünür.
  - auth ve monitoring-api: `/health` endpoint'i, slim imajda curl olmadığı için Node'un kendi `fetch`'iyle çağrılır.
- **Worker API'yi bekler:** Koleksiyonları ve index'leri API ilk açılışta oluşturur; worker da açılışta aynı kurulumu çalıştırır ama ikisinin aynı anda yarışmasına gerek kalmaz.
- **`DATABASE_URL`:** Varsayılan olarak `POSTGRES_*` değerlerinden üretilir. Şifrede `#`, `@`, `/` gibi URL'de özel anlamı olan karakterler varsa adres URL-encode edilerek doğrudan `DATABASE_URL` olarak verilmelidir.

## Ortam değişkenleri

| Değişken | Kullanan | Varsayılan | Açıklama |
|---|---|---|---|
| `POSTGRES_USER` / `POSTGRES_DB` | postgres, auth | `pingpulse` / `auth` | |
| `POSTGRES_PASSWORD` | postgres, auth | **zorunlu** | |
| `POSTGRES_HOST_PORT` / `MONGO_HOST_PORT` | compose | `5433` / `27018` | Sadece host erişimi |
| `JWT_SECRET` | auth, monitoring-api | **zorunlu** | En az 16 karakter. auth imzalar, monitoring doğrular |
| `JWT_EXPIRES_IN` | auth | `1h` | `15m`, `1h`, `7d` biçiminde |
| `INTERNAL_TOKEN` | auth, monitoring-api | **zorunlu** | Servisler arası çağrı secret'ı, en az 16 karakter |
| `MONITORING_URL` | auth | `http://monitoring-api:3002` | |
| `ALLOW_PRIVATE_TARGETS` | monitoring-api | `false` | `true` ise iç ağ adresleri izlenebilir. Sadece yerel denemeler için |
| `CHECK_CONCURRENCY` | worker | `10` | Aynı anda en fazla kaç kontrol |
| `CHECK_INTERVAL_SECONDS` | worker | `60` | Bir URL kaç saniyede bir kontrol edilir (en az 5) |
| `CHECK_TIMEOUT_MS` | worker | `5000` | Bir kontrolün (yönlendirmeler ve body dahil) en uzun süresi |
| `WORKER_TICK_MS` | worker | `1000` | Zamanı gelen monitor'lere ne sıklıkla bakılır |
| `UV_THREADPOOL_SIZE` | worker | `16` | `CHECK_CONCURRENCY`'den küçük olamaz (bkz. monitoring-service.md) |

Secret üretmek için:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Her servis açılışta kendi değişkenlerini Zod ile doğrular (fail-fast): eksik ya da hatalı bir değer varsa hangi değişkenin sorunlu olduğunu yazıp durur.
