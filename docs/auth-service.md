# auth-service

Şirketleri ve kullanıcıları yönetir, kimlik doğrular ve JWT üretir. Şirket planını değiştirir. Veritabanı: PostgreSQL. Port: 3001.

## Endpoint'ler

| Method | Path | Token | Açıklama |
|---|---|---|---|
| POST | `/auth/register` | – | Şirket (FREE) ve ilk kullanıcıyı oluşturur, token döner |
| POST | `/auth/login` | – | Token döner |
| GET | `/auth/me` | ✓ | Kullanıcı ve şirket bilgisi |
| POST | `/users` | ✓ | Kendi şirketine kullanıcı ekler |
| GET | `/users` | ✓ | Şirketin kullanıcıları |
| PATCH | `/company/plan` | ✓ | Planı değiştirir (FREE / PRO / ENTERPRISE) |
| GET | `/health` | – | Veritabanına `SELECT 1` atar |

## Klasör yapısı

```
services/auth/
├── Dockerfile
├── package.json
├── tsconfig.json, tsconfig.build.json
├── prisma.config.ts
├── prisma/
│   ├── schema.prisma
│   └── migrations/
└── src/
    ├── server.ts
    ├── app.ts
    ├── config/env.ts
    ├── database/prisma.ts
    ├── routes/
    ├── middleware/
    ├── controllers/
    ├── services/
    ├── clients/
    ├── validation/
    ├── errors/
    ├── utils/
    └── types/
```

## Proje dosyaları

| Dosya | Ne yapar |
|---|---|
| `Dockerfile` | İki aşamalı build. **build:** bağımlılıkları kurar, Prisma client'ı üretir, derler, `pnpm deploy --prod` ile sadece production paketlerini ayıklar. **runtime:** küçük imaj; openssl (Prisma migration motoru ister), `USER node` (root değil). Açılışta `prisma migrate deploy && exec node dist/server.js`. `exec` sayesinde Node PID 1 olur ve `docker stop`'un SIGTERM'ü doğrudan Node'a ulaşır; aksi halde Docker 10 sn bekleyip process'i zorla öldürür. |
| `package.json` | `files` alanı `pnpm deploy`'un hangi dosyaları kopyalayacağını belirler (`dist` git'te olmadığı için gerekli). `prisma` runtime'da migration çalıştırdığı için `dependencies` içindedir. |
| `tsconfig.json` | `module/moduleResolution: node16`, `strict`. |
| `tsconfig.build.json` | Test dosyalarını derlemeden hariç tutar. |
| `prisma.config.ts` | Prisma 7 ayarları. `DATABASE_URL` boş olabilir: `prisma generate` Docker build'de veritabanı olmadan çalışır. |
| `prisma/schema.prisma` | `companies` ve `users` tabloları. Plan enum'u (`NOT NULL DEFAULT 'FREE'`), UNIQUE e-posta, `company_id` foreign key ve index. Client `src/generated` altına üretilir (git'e girmez). E-postayı küçük harfe çevirmek uygulamanın işidir; UNIQUE buna güvenir. |
| `prisma/migrations/` | `prisma migrate dev` ile üretilmiş SQL dosyaları. Klasör adı zaman damgası + isimdir, dosya adı her zaman `migration.sql`. Uygulananlar Postgres'te `_prisma_migrations` tablosunda tutulur. |

## src/

| Dosya | Ne yapar |
|---|---|
| `server.ts` | Giriş noktası. Env'i doğrular, Prisma client, `TokenService` ve `MonitoringClient` oluşturur, uygulamayı başlatır. SIGTERM/SIGINT'te önce yeni bağlantı kabul etmeyi bırakır, devam eden istekleri bitirir, DB bağlantısını kapatır. |
| `app.ts` | Express uygulamasını kurar ve katmanları birbirine bağlar (servis → controller → route). Port dinlemez; testler bunu doğrudan kullanabilir. Middleware sırası önemlidir: `express.json()` → route'lar → `notFoundHandler` → `errorHandler` (en sonda olmak zorunda). |
| `config/env.ts` | Ortam değişkenlerini Zod ile doğrular (fail-fast). Hatalıysa bütün sorunları listeleyip process'i durdurur. `process.env`'i sadece burası okur. |
| `database/prisma.ts` | Prisma client'ı `@prisma/adapter-pg` ile oluşturur. `isUniqueViolation`: P2002 hatasını tanır. Eşzamanlı iki kayıt Zod'u geçse bile veritabanının UNIQUE kuralı ikincisini reddeder. |

### routes/
| Dosya | Ne yapar |
|---|---|
| `auth.routes.ts` | `/register` ve `/login` (token gerekmez), `/me` (token gerekir). |
| `users.routes.ts` | Router seviyesinde `requireAuth`: buraya eklenen her endpoint otomatik korunur. |
| `company.routes.ts` | `PATCH /company/plan`. |
| `health.routes.ts` | Process'in ayakta olması yetmez, veritabanına sorgu atılabilmeli. |

### middleware/
| Dosya | Ne yapar |
|---|---|
| `auth.middleware.ts` | `Authorization: Bearer <token>` başlığını okur (şema adı büyük/küçük harfe duyarsız, RFC 9110). Token doğrulanırsa kimliği `res.locals.user`'a yazar. Yoksa 401 `MISSING_TOKEN`. |
| `validate.middleware.ts` | Body'yi Zod şemasıyla doğrular. Geçersizse 400 `VALIDATION_FAILED`. Geçerliyse `req.body`'yi şemanın **dönüştürdüğü** haliyle değiştirir: e-posta küçük harfe çevrilmiş, şemada olmayan alanlar (örneğin body'ye eklenmiş bir `companyId`) atılmış olur. |
| `error.middleware.ts` | Bütün hataları tek formata çevirir: `{ statusCode, code, message, errors? }`. `AppError` kendi koduyla döner. Express'in ürettiği istemci hataları (bozuk JSON 400, çok büyük body 413, desteklenmeyen karakter seti 415, `%FF` gibi çözülemeyen URL 400) 500 değil kendi 4xx koduyla döner. Beklenmeyen hatalar log'a yazılır ve istemciye detay vermeden 500 döner. |

### controllers/
HTTP ile servis arasında çeviri yapar: istekten parçaları alır, servisi çağırır, yanıtı uygun durum koduyla döner. `companyId` her zaman `res.locals.user`'dan (token'dan) okunur. Metotlar arrow function'dır; route'a referans olarak verildiklerinde `this` kaybolmaz. Express 5 async hataları kendisi yakaladığı için `try/catch` yoktur.

| Dosya | Endpoint'ler |
|---|---|
| `auth.controller.ts` | register (201), login, me |
| `users.controller.ts` | create (201), list |
| `company.controller.ts` | changePlan |

### services/
| Dosya | Ne yapar |
|---|---|
| `auth.service.ts` | **register:** İç içe `create` ile şirket ve kullanıcı tek transaction'da oluşur; kullanıcı oluşamazsa şirket de oluşmaz. E-posta kayıtlıysa 409. **login:** Kullanıcı yoksa da şifre dummy hash'e karşı karşılaştırılır; böylece "kullanıcı yok" ve "şifre yanlış" aynı mesajı aynı sürede döner, kayıtlı e-postalar sızmaz. **me:** Token geçerli olsa bile kullanıcı silinmiş olabilir, DB'den tekrar okunur. |
| `users.service.ts` | Kullanıcıyı token'daki şirkete ekler. `list` `select` kullandığı için `passwordHash` DB'den hiç çekilmez. |
| `company.service.ts` | Plan değişikliği. Transaction içinde şirket için advisory lock alınır (`pg_advisory_xact_lock(hashtext(companyId))`), önce monitoring'e bildirilir, sonra Postgres güncellenir. Monitoring'e ulaşılamazsa 503 `PLAN_SYNC_FAILED` döner ve transaction geri alınır. Kilit aynı şirketin eşzamanlı plan değişikliklerini sıraya sokar; olmasa iki istek iki tarafa ters sırayla yazıp kalıcı tutarsızlık yaratabilir. Kilit satırı değil hash'i tuttuğu için şirketin diğer işlemleri (kullanıcı ekleme vb.) bloklanmaz. |
| `views.ts` | Yanıtlarda alanlar tek tek seçilir; `passwordHash` gibi alanlar yanlışlıkla dışarı sızmaz. |

### clients/
| Dosya | Ne yapar |
|---|---|
| `monitoring.client.ts` | monitoring-service'in internal API'sini çağırır (`PUT /internal/companies/:id/plan`, `X-Internal-Token` başlığıyla). 3 sn timeout. `redirect: 'error'`: yönlendirme takip edilmez, edilseydi internal token başka bir adrese de gönderilirdi. Çağrı idempotent'tir (upsert); tekrarlanması sonucu değiştirmez. |

### validation/
| Dosya | Ne yapar |
|---|---|
| `common.schemas.ts` | **E-posta:** önce kırpılır ve küçük harfe çevrilir, sonra doğrulanır (en fazla 254 karakter). **Şifre:** en az 8 karakter, en fazla **72 byte**. bcrypt ilk 72 byte'tan sonrasını sessizce yok sayar; sınır karakter değil byte üzerinden konur (Türkçe karakterler 2 byte). |
| `auth.schemas.ts` | Kayıt ve giriş. Girişte şifre kuralları uygulanmaz: kurallar ileride değişirse eski kullanıcılar dışarıda kalmasın. |
| `users.schemas.ts` | `companyId` bilerek yoktur: yeni kullanıcı her zaman token'daki şirkete eklenir. |
| `company.schemas.ts` | Plan sadece `FREE`, `PRO` ya da `ENTERPRISE`. |

### errors/, utils/, types/
| Dosya | Ne yapar |
|---|---|
| `errors/app-error.ts` | `AppError(status, code, message, details?)`. `ErrorCode` kullanılabilecek bütün kodların listesidir; yazım hatası derlemeyi durdurur. Kodlar istemcinin (ileride frontend'in) çeviri anahtarı olarak kullanılabilir. |
| `utils/password.ts` | bcrypt (cost 10, async API: hesaplama libuv thread pool'unda yapılır, event loop bloklanmaz). Dummy hash açılışta rastgele bir şifreden **gerçek hash'lerle aynı cost ile** üretilir; cost değişse bile iki durumun yanıt süresi eşit kalır. |
| `utils/jwt.ts` | `TokenService`: HS256 ile imzalar ve doğrular. Algoritma açıkça belirtilir (`alg: none` gibi saldırılara karşı). Doğrulanan token'da `exp` zorunludur; süresiz token kabul edilmez. Payload şifreli değil sadece imzalıdır, içine hassas veri konmaz. |
| `types/express.d.ts` | `res.locals.user`'ın tipini (`AuthUser`) TypeScript'e tanıtır. |
