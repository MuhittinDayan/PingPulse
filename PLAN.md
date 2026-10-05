# PingPulse – Nihai Plan

Bu doküman projenin tek referansıdır. Burada yazmayan şey kapsam dışıdır.
Kararlar `backend-development-docs` klasöründeki notlarla uyumlu tutulmuştur. İlgili yerlerde kaynak doküman adı `[doküman]` şeklinde belirtildi.

---

## 1. Hedef

Şirketler kayıt olur, izlemek istedikleri URL'leri ekler. Sistem bu URL'lere periyodik istek atar, yanıt süresini ve durumu MongoDB time series koleksiyonuna yazar. Kullanıcı yalnızca kendi şirketinin verisini görür ve bir URL için son 24 saatin ortalama yanıt süresini ve uptime yüzdesini sorgular. Veriler şirketin planına göre (7 / 30 / 90 gün) otomatik silinir.

---

## 2. Mimari

```
                    ┌────────────────────┐
 İstemci ─────────▶ │   auth-service     │──▶ PostgreSQL
    │               │  (Express, :3001)  │
    │ JWT           └─────────┬──────────┘
    │                         │ plan değişikliği (X-Internal-Token)
    ▼                         ▼
┌──────────────────────────────────────────┐
│          monitoring-service              │
│  ┌────────────────┐  ┌────────────────┐  │
│  │ api (:3002)    │  │ worker         │  │──▶ MongoDB
│  │ CRUD + rapor   │  │ periyodik istek│  │
│  └────────────────┘  └────────────────┘  │
└──────────────────────────────────────────┘
```

- **2 mikroservis:** `auth-service` ve `monitoring-service`.
- Worker ayrı bir servis değildir. Monitoring servisinin bir process'idir: aynı kod, aynı image, aynı veritabanı. Sadece başlatma komutu farklıdır. Böylece "her servis kendi DB'si" kuralı tam olarak sağlanır, API ile worker da birbirinin yükünden etkilenmez.
- Servisler arasındaki tek iletişim: auth, plan değişince monitoring'e haber verir.

### Container'lar

| Container | Image | Not |
|---|---|---|
| postgres | `postgres:16` | healthcheck: `pg_isready` |
| mongo | `mongo:7.0` | healthcheck: `mongosh ping`. Sürüm sabit, partial TTL için 7.x gerekli |
| auth | `./services/auth` | açılışta `prisma migrate deploy` çalışır |
| monitoring-api | `./services/monitoring` | açılışta `db/setup` çalışır, healthcheck: `GET /health` |
| monitoring-worker | `./services/monitoring` | aynı image, `node dist/worker.js`. Açılışta `db/setup` çalışır. `depends_on: monitoring-api (service_healthy)` |
| frontend *(sonra)* | `./frontend` | nginx |

**`db/setup` (api ve worker iş başlamadan önce çağırır):** Koleksiyonları ve index'leri idempotent şekilde oluşturur. `measurements` zaten varsa `listCollections` ile tipinin `timeseries` olduğunu kontrol eder. Değilse process açık bir hatayla durur.
Bu kontrol neden gerekli: Worker, koleksiyon oluşturulmadan `insertOne` yaparsa MongoDB `measurements`'ı **normal koleksiyon** olarak otomatik oluşturur. Bu durumda time series ve TTL hiçbir hata vermeden devre dışı kalır.

Kurulum: `docker-compose up` (ya da `docker compose up --build`). İmaj yoksa ilk açılışta build otomatik yapılır. `.env` dosyası gerekmez, compose'da geliştirme amaçlı varsayılan değerler var (§11).

---

## 3. Teknoloji Seçimleri ve Gerekçeleri

| Seçim | Gerekçe |
|---|---|
| **Node.js + TypeScript** | İşin neredeyse tamamı I/O-bound: HTTP isteği atıp yanıt beklemek. Event loop bu bekleme sürelerinde diğer işleri ilerletir. CPU-bound iş (bcrypt) async API ile libuv thread pool'a bırakılır, worker_threads gerekmez. [Nodejs-Calisma-Mantigi] |
| **pnpm workspaces** (monorepo) | Tek repo, tek lock dosyası (`pnpm-lock.yaml`, git'e commit edilir). Sıkı `node_modules` yapısı phantom dependency'yi engeller, bu da Docker'daki temiz kurulumda "bende çalışıyordu" sorununu önler. Servisler arasında paylaşılan kod paketi **yok**, her servis bağımsız kalır. [npm-vs-pnpm] |
| **Express 5** | Katmanlı ve açık yapı: her isteğin yolu route dosyasında satır satır okunur (`router.post('/login', validate(schema), controller.login)`). Decorator ve DI container "sihri" yok. Express 5 async hataları kendisi yakalar. Bağımlılıklar servislere parametre olarak verilir, bu sayede test edilebilirlik korunur. (İlk sürüm NestJS ile yazıldı. Katmanlı yapı ve okunabilirlik tercihi nedeniyle Faz 2 incelemesinde Express'e geçildi.) |
| **Zod** | Hem env doğrulaması (fail-fast) hem de request body doğrulaması için tek şema kütüphanesi. DB constraint'leri bunun **ek olarak** veriyi korur. [Veritabani-Temelleri §9, Environment-Variables] |
| **PostgreSQL** (auth) | Şirket–kullanıcı ilişkisi ilişkisel bir veri. Foreign key ile bütünlük, `UNIQUE(email)` ile tekillik, şirket ve ilk kullanıcının **tek transaction'da** oluşturulması (ACID). Şema küçük ve sabit. [Veritabani-Temelleri] |
| **Prisma** | Tip güvenli sorgular ve versiyonlanmış migration dosyaları. |
| **MongoDB time series** (ölçümler) | Sürekli eklenen ve zaman aralığına göre sorgulanan ölçümler için uygundur. Ölçümler meta alanına göre bucket'lara gruplanır, sütun bazlı ve zstd ile sıkıştırılır. Index ölçüm başına değil bucket başına tutulur. Yaptığımız denemede normal koleksiyona göre disk kullanımı **yaklaşık 13 kat** azaldı. Native TTL ve zaman bazlı aggregation desteği var. [mongoDb-tsdb-test] |
| **MongoDB normal koleksiyon** (monitors) | Monitoring servisinin bütün verisi kendi DB'sinde durur. |
| **Native `mongodb` driver** | Time series seçenekleri, partial TTL index ve aggregation üzerinde tam kontrol sağlar. Mongoose bu detayları gizliyor. |
| **undici** | Node'un kendi HTTP motoru. `lookup` hook'u ile SSRF kontrolü, `AbortSignal` ile kesin timeout. |
| **JWT HS256** | Tek ortak secret ile kurulumu basit. RS256 production önerisi olarak README'de belirtilecek. |
| **Jest + Supertest + mongodb-memory-server** | Integration testleri mock'lanmış DB yerine canlı ortamla **aynı sürümde** (7.0) gerçek ama geçici bir mongod ile çalışır. [Yazılım-test-turleri §4] |

---

## 4. Veri Modelleri

### PostgreSQL (auth)

```
companies: id (uuid, pk), name (NOT NULL), plan (enum FREE|PRO|ENTERPRISE, NOT NULL, varsayılan FREE), created_at
users:     id (uuid, pk), company_id (fk → companies, NOT NULL), email (NOT NULL, UNIQUE), password_hash (NOT NULL), created_at
index:     users(company_id)   → şirketin kullanıcılarını listelemek için
```
- E-posta kaydedilmeden önce `trim` + küçük harfe çevrilir. Aksi halde `Ali@x.com` ile `ali@x.com` iki ayrı hesap olabilir.
- Şifre `bcrypt` ile hashlenir (cost 10). **Async** API (`bcrypt.hash`) kullanılır, `hashSync` event loop'u bloklar.
- Doğrulama iki katmanlıdır: Zod kullanıcıya erken ve anlaşılır hata verir, DB constraint'leri ise verinin bozulmasını engeller. Aynı e-posta ile yapılan eşzamanlı kayıtta Zod kontrolü atlanabilir, `UNIQUE` constraint yine de korur (P2002 hatası → 409).

### MongoDB (monitoring)

**`monitors`** (normal koleksiyon)
```
{ _id, companyId, name, url, normalizedUrl, isActive, nextCheckAt, createdAt }
index: { companyId: 1, normalizedUrl: 1 } unique   → aynı şirkette aynı URL iki kez eklenemez
normalizedUrl: WHATWG URL ile çözülür (şema ve host küçük harf, varsayılan port 80/443 atılır, aynı karakterin farklı kodlamaları tek biçime iner), sonra fragment (#...) atılır. Query parametrelerinin sırası ve değerleri değiştirilmez.
index: { isActive: 1, nextCheckAt: 1 }             → zamanı gelen monitor'leri bulmak için
```

**`company_plans`** (normal koleksiyon, auth'taki planın kopyası)
```
{ _id: companyId, plan, updatedAt }
```
Kaydı olmayan şirket **FREE** kabul edilir. Bu yüzden kayıt sırasında senkronizasyon gerekmez.

**`measurements`** (time series)
```js
db.createCollection("measurements", {
  timeseries: {
    timeField: "timestamp",
    metaField: "meta",
    bucketMaxSpanSeconds: 3600,
    bucketRoundingSeconds: 3600
  },
  expireAfterSeconds: 7776000            // 90 gün: ENTERPRISE ve güvenlik ağı
})
```
```
{ timestamp, meta: { companyId, monitorId, plan },
  isUp, statusCode, responseTimeMs, errorCode, scheduleLagMs }
```
Index'ler:
```
{ timestamp: 1 }  partial { "meta.plan": "FREE" }  expireAfterSeconds: 604800    (7 gün)
{ timestamp: 1 }  partial { "meta.plan": "PRO" }   expireAfterSeconds: 2592000   (30 gün)
{ "meta.monitorId": 1, timestamp: 1 }                                            (rapor sorguları)
```
Index sıraları ESR kuralına göredir: önce eşitlik (`meta.monitorId`, `companyId`), sonra sıralama/aralık (`timestamp`, `nextCheckAt`). Rapor sorgusunun bu index'i kullandığı `explain()` çıktısında IXSCAN ile doğrulanır. [MongoDB-Index §2-3]

---

## 5. API

### auth-service (:3001)

| Method | Path | Auth | Açıklama |
|---|---|---|---|
| POST | `/auth/register` | – | `{companyName, email, password}`. Şirketi (FREE) ve ilk kullanıcıyı **tek transaction'da** oluşturur |
| POST | `/auth/login` | – | `{email, password}` → `{accessToken}` |
| GET | `/auth/me` | JWT | Giriş yapan kullanıcı ve şirketi |
| POST | `/users` | JWT | Kendi şirketine yeni kullanıcı ekler (companyId JWT'den alınır) |
| GET | `/users` | JWT | Şirketin kullanıcıları |
| PATCH | `/company/plan` | JWT | `{plan}`. Bkz. §9 |

### monitoring-api (:3002)

| Method | Path | Auth | Açıklama |
|---|---|---|---|
| POST | `/monitors` | JWT | `{url, name?}` |
| GET | `/monitors` | JWT | Şirketin monitor'leri |
| DELETE | `/monitors/:id` | JWT | Sıra sabit: önce monitor silinir, sonra ölçümleri `deleteMany` ile silinir |
| GET | `/monitors/:id/report` | JWT | Son 24 saat raporu (§10) |
| PUT | `/internal/companies/:companyId/plan` | `X-Internal-Token` | Sadece auth-service çağırır |

---

## 6. Kimlik Doğrulama ve Tenant İzolasyonu

- JWT: HS256, süresi 1 saat. Payload: `{ sub: userId, companyId, email }`. Payload şifreli değil, sadece imzalı. Bu yüzden içine hassas veri konmaz. [cookie-session-jwt-notlari §4]
- "Verify, don't trust": monitoring her istekte imzayı ve `exp` değerini doğrular. Auth'a istek atmaz, bu stateless doğrulamanın avantajı.
- API'ler token'ı `Authorization: Bearer` header'ından okur (Postman/curl ve servisler arası kullanım için en sade yol).
- **Frontend'de token:** Bellekte tutulur (sayfa yenilenince yeniden giriş). localStorage'a yazılmaz, çünkü XSS durumunda çalınabilir. HttpOnly cookie + SameSite daha güvenli bir seçenek ama ek CSRF ve proxy kurulumu gerektiriyor, bilinen eksiklere yazılacak. [cookie-session-jwt-notlari §7]
- `companyId` **her zaman JWT'den** okunur. Body, query veya path'te gelen companyId'ye asla güvenilmez.
- Monitoring'deki her repository fonksiyonu `companyId` parametresini zorunlu alır. Filtresiz sorgu yazılamaz.
- Başka şirkete ait kaynak istenirse **404** döner (403 kaynağın var olduğunu sızdırır).
- Şirketi bilen biri dışarıdan katılamaz. Yeni kullanıcıyı sadece o şirketin giriş yapmış bir kullanıcısı ekler.
- Rol yok: şirketteki her kullanıcı aynı yetkiye sahip. **Bunun sonucu:** herhangi bir kullanıcı ödeme yapmadan planı ENTERPRISE yapabilir. Demo için kabul edilebilir, README'de açıkça belirtilecek.
- `/internal/*` route'ları JWT'yi değil, `X-Internal-Token` (env'deki ortak secret) değerini kontrol eden ayrı bir middleware ile korunur.
- **Hata formatı:** Her hata yanıtında makinenin okuyabileceği sabit bir `code` alanı bulunur: `{ "code": "EMAIL_ALREADY_REGISTERED", "message": "Email is already registered" }`. Mesajlar İngilizcedir. İstemci (frontend) çeviriyi `code` üzerinden yapar. Sunucu tarafında i18n yoktur, ama kodlar ileride çeviri anahtarı olarak kullanılabilir.

---

## 7. Worker: Scheduler ve Eşzamanlılık

### Akış
```
loop (her WORKER_TICK_MS):
  while (semaphore'da boş slot var):
    slot al
    monitor = findOneAndUpdate(
        { isActive: true, nextCheckAt: { $lte: now } },
        { $set: { nextCheckAt: now + CHECK_INTERVAL } },
        { sort: { nextCheckAt: 1 } })          ← atomik claim
    monitor yoksa: slotu bırak, döngüden çık
    check(monitor) başlat (beklemeden) → bitince ölçümü yaz, slotu bırak
```

- **En fazla N istek:** Bir monitor ancak boş slot varsa claim edilir. Böylece aynı anda en fazla `CHECK_CONCURRENCY` istek çalışır ve bellekte sınırsız bir kuyruk birikmez. `Promise.all` bir concurrency limiti **değildir**: 1000 monitor için 1000 isteği birden başlatır. Bu yüzden kullanılmaz. Semaphore kütüphanesiz, küçük ve test edilmiş kendi kodumuzdur (worker pool mantığı). [NodeJS-Async-Concurrency §9-11]
- **Concurrency ≠ rate limit:** Sistem aynı anda çalışan kontrol sayısını N ile sınırlar; bu bir concurrency limitidir. Saniyedeki istek sayısını sınırlamıyoruz.
- **Atomik claim:** Birden fazla worker çalışsa bile aynı monitor iki kez kontrol edilmez.
- **Hata izolasyonu:** Her kontrolün kendi timeout'u ve try/catch'i var. Yavaş bir URL sadece kendi slotunu ve en fazla timeout süresi kadar meşgul eder. Hiçbir hata döngüyü durdurmaz.
- **`scheduleLagMs`:** Planlanan zaman ile gerçek başlangıç arasındaki fark. Toplu kesintide oluşan gecikmeyi görünür kılar.
- **Graceful shutdown:** SIGTERM gelince yeni claim yapılmaz, devam eden istekler bitince process kapanır.
- Ölçümler `insertOne` ile anında yazılır. Buffer kullanılmadığı için çökmede veri kaybı olmaz. `insertMany` ile toplu yazmak daha verimli, ama bizim yazma hızımız (saniyede birkaç ölçüm) MongoDB için çok düşük. Sadelik ve veri güvenliği tercih edildi. [TSDB-Retention §18]
- **DNS ve thread pool:** `dns.lookup` libuv thread pool'unu kullanır (varsayılan 4 thread). N=10 kontrolde yavaş yanıt veren bir DNS sunucusu 4 thread'i de meşgul ederse diğer URL'ler DNS sırasında bekler. Bu durum diğer kontrollerin DNS çözümlemesini geciktirir. Bu yüzden worker'da `UV_THREADPOOL_SIZE` değeri `CHECK_CONCURRENCY` değerinden büyük ya da eşit ayarlanır (compose'da `max(4, N)`). [Nodejs-Calisma-Mantigi §11]

### HTTP kontrolü
- `undici.request` kullanılır (native fetch'te redirect sayısı sabit 20, değiştirilemiyor). `GET`, User-Agent `PingPulse-Monitor/1.0`.
- Timeout: `CHECK_TIMEOUT_MS` (AbortSignal). Süre bütün yönlendirme zinciri için geçerlidir. **Timeout gerçek bir iptaldir:** `Promise.race` ile kurulan bir timeout sadece beklemeyi bırakır, istek arka planda devam eder. `AbortSignal` ise socket'i de kapatır, böylece slot ve bağlantı gerçekten serbest kalır. [NodeJS-Async-Concurrency §14]
- **Yönlendirmeler elle takip edilir:** `undici.request` yönlendirmeleri kendisi takip etmez. 3xx gelirse `Location` çözülür, hedef SSRF kontrolünden geçer, en fazla 5 adım izlenir. 5 adım aşılırsa sonuç `HTTP_ERROR` olur.
- **`responseTimeMs`** = isteğin başlangıcından **son** yanıtın header'larının gelmesine kadar geçen süre (DNS + TCP + TLS + sunucu işleme, yönlendirmeler dahil).
- **Body bırakma:** Header'lar gelince her yanıtta (yönlendirmeler dahil) `res.body.dump({ limit: 64 KB })` çağrılır. Bu çağrı yapılmazsa socket keep-alive havuzuna dönmez ve bağlantılar sızar.
- **UP:** son yanıtın durum kodu 200–399 aralığında.
- **errorCode:** `TIMEOUT`, `DNS_ERROR`, `CONN_REFUSED`, `TLS_ERROR`, `HTTP_ERROR` (beklenmeyen durum kodu), `BLOCKED_TARGET` (SSRF), `UNKNOWN`.
- Ölçüme yazılacak plan `company_plans` koleksiyonundan okunur ve bellekte 30 sn cache'lenir.

### Retry
- **Sadece** `CONN_REFUSED`, `ECONNRESET` ve 502, 503, 504 için yapılır.
- **TIMEOUT tekrar edilmez.** Edilseydi en kötü durumda bir slot 3 × 5 sn meşgul kalırdı ve toplu kesintide kapasite üçte bire düşerdi. Timeout'a düşen bir site zaten yavaştır, hemen tekrar denemek sonucu değiştirmez.
- **4xx ve 429 tekrar edilmez.** 4xx kalıcı bir hatadır. 429 "beni yavaşlat" demektir, hemen tekrar denemek karşı tarafı daha çok yorar.
- En fazla 2 tekrar, exponential backoff ile: `delay = baseDelay * 2 ** attempt` (200 ms, 400 ms), **aynı slot içinde**. Tekrar edilen hatalar hızlı döndüğü için slot maliyeti düşük kalır. [NodeJS-Async-Concurrency §12-13]

### SSRF
- Ekleme anında: sadece `http`/`https`, geçerli URL, en fazla 2048 karakter, literal özel IP ve `localhost` reddedilir (erken ve hızlı hata).
- **Asıl kontrol istek anında yapılır, iki noktada:**
  1. **Hostname ise:** undici `connect.lookup` hook'unda, DNS çözüldükten sonra IP kontrol edilir. Bu, DNS rebinding'i kapsar.
  2. **Literal IP ise:** Node IP adresleri için DNS çözümlemesi yapmaz, dolayısıyla `lookup` hiç çağrılmaz. Bu yüzden istek atılmadan önce (ilk URL'de ve her yönlendirme adımında) IP doğrudan kontrol edilir. Örneğin `Location: http://169.254.169.254/` yönlendirmesi bu kontrolle yakalanır.
- **Kural:** `ipaddr.process(ip).range() !== 'unicast'` ise engellenir. `process()` IPv4-mapped IPv6 adresini IPv4'e çevirir. Bu tek kontrol private, loopback, link-local, CGNAT, multicast, reserved ve benchmarking aralıklarının hepsini kapsar. Elle liste tutulmaz.
- Engellenen istek `BLOCKED_TARGET` hata koduyla kaydedilir.
- `ALLOW_PRIVATE_TARGETS=true` yerel denemeler için bu kontrolü kapatır (varsayılan `false`).

---

## 8. TTL Yaklaşımı

| Plan | Saklama | Mekanizma |
|---|---|---|
| FREE | 7 gün | partial TTL index `{"meta.plan": "FREE"}` |
| PRO | 30 gün | partial TTL index `{"meta.plan": "PRO"}` |
| ENTERPRISE | 90 gün | koleksiyon seviyesi `expireAfterSeconds` |

- Silmeyi MongoDB'nin TTL monitörü yapar, cron yazmıyoruz.
- Koleksiyon seviyesindeki 90 günlük TTL bir güvenlik ağıdır. Plan bilgisi ne olursa olsun hiçbir veri 90 günden uzun kalmaz.
- **Silme tam zamanında olmaz:** TTL time series'te bucket bazında çalışır. Bir bucket'ın silinmesi için içindeki en yeni ölçümün süresinin de dolmuş olması gerekir. Bucket aralığı 1 saate sabitlendiği için gecikme en fazla yaklaşık 1 saat + TTL monitör periyodu (60 sn) olur. Saklama süresi bir "silme eşiği" olarak düşünülmeli.
- **Bu kurgu daha önce denendi [mongoDb-tsdb-test]:** Genel TTL ile metaField üzerindeki partial TTL'ler birlikte çalışıyor. Bir veriye ikisi birden uygulanırsa **süresi kısa olan** geçerli olur. Partial TTL süreyi yalnızca kısaltabilir, bu yüzden en uzun süre (90 gün) genel TTL olarak tanımlanır.
- Not: `TSDB-Retention-Politikalari §16` time series için "plan başına ayrı koleksiyon gerekir" diyor. Biz ölçülmüş deney sonucunu esas alıyoruz: tek koleksiyon + partial TTL. Bu sayede plan başına ayrı koleksiyona yazma (routing) ve sorguların birden fazla koleksiyona dağılması gerekmiyor.
- Bu davranış §12'deki testlerle (index tanımı + gerçek silme) projede de kanıtlanır.
- **İleride:** Ham veri silinmeden önce saatlik/günlük özet (downsampling) tutulabilir. Uzun vadeli trend sorguları için faydalı, ama kapsam dışı. [TSDB-Retention §3]

---

## 9. Plan Değişikliği: Snapshot Politikası

**Karar:** Her ölçüm, **yazıldığı andaki planın** saklama süresine tabidir. Eski ölçümlere dokunulmaz.

- FREE → PRO: Eski ölçümler 7 günde silinir, yeni ölçümler 30 gün saklanır.
- PRO → FREE: Eski ölçümler kendi 30 gününü doldurur, yeni ölçümler 7 gün saklanır.
- **Gerekçe:** Time series üzerinde toplu güncelleme ve yarış durumu riski yok. "Her ölçüm alındığı andaki sözleşmenin şartlarına tabidir" kuralı açık ve savunulabilir.

**Akış:**
```
PATCH /company/plan
  1. monitoring'e PUT /internal/companies/:id/plan atılır (idempotent upsert)
       └─ başarısızsa → 503 döner, hiçbir şey değişmemiştir
  2. Postgres'te companies.plan güncellenir
```
- Ağ çağrısı DB transaction'ının içinde **yapılmaz**. Aksi halde monitoring yavaş yanıt verdiğinde bağlantı ve satır kilidi de o süre boyunca tutulur.
- **Nadir durum:** 1. adım başarılı olup 2. adım başarısız olursa iki taraf geçici olarak tutarsız kalır (monitoring yeni planda, auth eski planda). İstemci aynı isteği tekrarlar, PUT idempotent olduğu için tutarlılık geri gelir. Snapshot politikası sayesinde bu tutarsızlığın etkisi sadece birkaç ölçümün saklama süresidir. README'de belirtilecek.
- Plan değişikliğinden sonra worker cache'i en geç 30 sn içinde yenilenir. Bu sürede yazılan birkaç ölçüm eski planla kaydedilir, snapshot politikasında bu kabul edilebilir bir durumdur.

---

## 10. Rapor: `GET /monitors/:id/report`

- **Pencere:** `now − 24 saat < timestamp ≤ now`, kayan pencere. Sınır açıkça tanımlı: tam 24 saat önceki ölçüm dahil **değildir**.
- `now` fonksiyona parametre olarak verilir (varsayılan `new Date()`). Böylece testler gerçek saate bağlı olmaz ve flaky olmaz. [Yazılım-test-turleri §11]
- Arayüzde liste ekranında her monitor'ün özeti gösterilirse, her monitor için ayrı sorgu atılmaz (N+1). Tek bir aggregation `$group: monitorId` ile hepsi birlikte hesaplanır. [Veritabani-Temelleri §8]
- **uptimePercent** = UP kontrol sayısı / toplam kontrol sayısı × 100 (2 ondalık).
- **avgResponseMs** = sadece **UP** kontrollerin `responseTimeMs` ortalaması. Başarısız istekler (timeout veya hızlı dönen hata sayfaları) ortalamayı bozmasın diye dahil edilmez.
- **Ölçüm yoksa:** `uptimePercent: null`, `avgResponseMs: null`, `totalChecks: 0`.
- Duraklatılmış süreler hesaba girmez, çünkü o sürede ölçüm yapılmaz.
- Tek bir aggregation sorgusu ile hesaplanır: `$match` (companyId + monitorId + zaman aralığı) ve ardından `$group`.

```json
{ "monitorId": "…", "url": "https://acme.com", "windowHours": 24,
  "totalChecks": 1440, "upChecks": 1430, "uptimePercent": 99.31, "avgResponseMs": 312 }
```

---

## 11. Konfigürasyon (env)

İki katmanlı kural [Environment-Variables]:
- **Compose katmanı:** Bütün değişkenlerin compose dosyasında **geliştirme amaçlı varsayılanı** var (`${JWT_SECRET:-dev-only-jwt-secret}` gibi), böylece `.env` olmadan da sistem ayağa kalkar.
- **Uygulama katmanı (fail-fast):** Her servis açılışta env değişkenlerini Zod şemasıyla doğrular. Zorunlu bir değişken eksikse ya da hatalıysa (örneğin `CHECK_CONCURRENCY=abc`) servis hangi değişkenin sorunlu olduğunu yazıp hemen durur. `undefined` ile çalışmaya devam etmez.
- `.env.example` dosyası değişken listesini dokümante eder ve commit edilir. `.env` dosyası `.gitignore`'dadır.
- `NODE_ENV=production` iken hata yanıtlarında stack trace gösterilmez.
- README'de "production'da secret'ları değiştirin, sızan bir secret git geçmişinden silinse bile rotate edilmelidir" notu olacak.
- **Açık iş (teslimden önce):** Compose'daki `dev-only-*` varsayılanları kaldırılıp değerler `.env`'e taşınacak; `.env.example` sadece anahtar adlarını içerecek. Kod değişmez, sadece `docker-compose.yml` ve `.env.example` etkilenir. Geçmişteki değerler sahte olduğu için rotate gerekmez.

| Değişken | Varsayılan | Servis |
|---|---|---|
| `JWT_SECRET` | `dev-only-jwt-secret` | auth, monitoring |
| `JWT_EXPIRES_IN` | `1h` | auth |
| `INTERNAL_TOKEN` | `dev-only-internal-token` | auth, monitoring |
| `DATABASE_URL` | compose'daki postgres | auth |
| `MONITORING_URL` | `http://monitoring-api:3002` | auth |
| `MONGO_URL` | compose'daki mongo | monitoring |
| `CHECK_CONCURRENCY` | `10` | worker |
| `CHECK_INTERVAL_SECONDS` | `60` | worker |
| `CHECK_TIMEOUT_MS` | `5000` | worker |
| `CHECK_MAX_RETRIES` | `2` | worker |
| `WORKER_TICK_MS` | `1000` | worker |
| `ALLOW_PRIVATE_TARGETS` | `false` | api, worker |
| `UV_THREADPOOL_SIZE` | `16` (en az `CHECK_CONCURRENCY`) | worker |
| `NODE_ENV` | `production` | hepsi |

---

## 12. Testler

İlkeler [Yazılım-test-turleri]: Testler kodun ne yaptığına göre değil, **gereksinime göre** yazılır. AAA (Arrange-Act-Assert) kalıbı kullanılır. Her test bağımsızdır, her testten sonra DB temizlenir. Unit testlerde dış bağımlılıklar mock'lanır. Integration testlerde projenin kendi kodu ve geçici gerçek DB çalışır. Sabit süre beklenmez, koşul sağlanana kadar polling yapılır. İlk seferde geçen her test, kod bilerek bozularak bir kez kontrol edilir.
Unit ve integration testleri ayrı klasörlerdedir (`test/unit`, `test/integration`).

| Seviye | Test | Ne kanıtlıyor |
|---|---|---|
| Unit | Semaphore | Aynı anda çalışan iş sayısı hiçbir an N'yi geçmiyor, slotlar hata durumunda da bırakılıyor |
| Unit | Worker izolasyonu | Timeout'a düşen bir kontrol diğer kontrolleri bekletmiyor |
| Unit | Retry | Sadece tanımlı hatalarda tekrar ediliyor (4xx, 429 ve TIMEOUT'ta edilmiyor), başarıdan sonra gereksiz deneme yapılmıyor |
| Unit | SSRF | Özel/reserved IP'ler, IPv4-mapped IPv6 ve literal IP'ye yönlendirme engelleniyor, bayrak açıkken izin veriliyor |
| Unit | URL normalizasyonu | Büyük/küçük harf, varsayılan port ve fragment farkları aynı `normalizedUrl`'ye çıkıyor |
| Integration | Tenant izolasyonu | A şirketi B'nin monitor'ünü listeleyemiyor, silemiyor, raporunu alamıyor (404). Test için JWT doğrudan imzalanır, auth servisine gerek yok |
| Integration | Rapor | Bilinen ölçümlerden uptime ve ortalama doğru hesaplanıyor. Sınır değerler: tam 24 saat önceki ölçüm dahil değil, boş veride `null` dönüyor |
| Integration | Rapor index kullanımı | Rapor sorgusunun `explain()` çıktısında IXSCAN görülüyor |
| Integration | TTL index tanımları | `listIndexes` ve koleksiyon seçeneklerinde `partialFilterExpression` ve `expireAfterSeconds` değerleri birebir doğru. **Bu ana TTL testidir.** |
| Integration | TTL gerçek silme | Bizim kurduğumuz TTL kombinasyonunun beklendiği gibi sildiğini kanıtlar (aşağıda) |
| Integration | Setup koruması | `measurements` normal koleksiyon olarak varsa `db/setup` hata verip duruyor |
| Integration | Auth kaydı | Aynı e-posta (farklı büyük/küçük harfle) ikinci kez kayıt olamıyor → 409 |
| Smoke | `scripts/smoke.sh` | `docker-compose up` sonrası: kayıt → giriş → monitor ekle → ölçüm gelene kadar bekle → rapor alınıyor |

**Neden gerçek silme testi de var?** Test dokümanındaki ilke "veritabanının kendi özelliği test edilmez, ayarın doğru yapıldığı test edilir" diyor. Ana testimiz (index tanımları) bu ilkeye uyuyor. Gerçek silme testi MongoDB'yi değil, **bizim kurduğumuz kombinasyonu** (genel TTL + iki partial TTL) doğruluyor. Ayrıca README'deki "TTL doğruluğu" iddiasının somut kanıtı oluyor. Zamana bağlı olduğu için sabit süre beklemez, koşul sağlanana kadar polling yapar (en fazla 30 sn).

**TTL gerçek silme testi:** mongodb-memory-server `--setParameter ttlMonitorSleepSecs=1` ile başlatılır. Şu ölçümler eklenir:

| Ölçüm | Beklenen |
|---|---|
| FREE, 8 gün önce | silinir (partial 7 gün) |
| PRO, 8 gün önce | kalır |
| PRO, 31 gün önce | silinir (partial 30 gün) |
| ENTERPRISE, 31 gün önce | kalır |
| ENTERPRISE, 91 gün önce | silinir (koleksiyon 90 gün) |

Beklenen 3 kayıt silinene kadar polling yapılır, ardından kalması gereken 2 kaydın hâlâ durduğu doğrulanır.

---

## 13. Bilinen Eksikler (README'ye yazılacak)

- **At-most-once:** Worker claim'den hemen sonra çökerse o aralıktaki kontrol atlanır.
- **Toplu kesinti:** Sitelerin çoğu timeout'a düşerse kapasite N / timeout'a iner (N=10, 5 sn için saniyede 2 kontrol) ve kontroller gecikir. Gecikme `scheduleLagMs` ile ölçülüyor.
- Retry slotu tutuyor (sadece hızlı dönen hatalarda). Gecikmeli bir kuyruk ile iyileştirilebilir.
- Rol yok, bu yüzden herhangi bir kullanıcı planı değiştirebilir. Refresh token ve token iptali de yok (JWT 1 saat geçerli).
- HS256 kullanılıyor. Production için RS256/JWKS önerilir. Compose'daki varsayılan secret'lar sadece geliştirme içindir.
- Plan değişikliği senkron HTTP çağrısıyla yayılıyor. Nadiren geçici tutarsızlık olabilir, isteği tekrarlamak düzeltir. Production için outbox + mesaj kuyruğu önerilir.
- Kontrol sürerken monitor silinirse o kontrolün ölçümü sahipsiz kalabilir. Zararsızdır, TTL ile temizlenir.
- Domain sahipliği doğrulanmıyor. Bot korumalı siteler 403 dönebilir.
- TTL silmesi en fazla yaklaşık 1 saat gecikebilir.
- Plan bazlı kullanıcı/URL limitleri ve URL başına kontrol aralığı yok.
- Frontend token'ı bellekte tutuyor (sayfa yenilenince yeniden giriş gerekiyor). HttpOnly cookie + SameSite + refresh token rotation daha güvenli bir yapı.
- Downsampling (saatlik/günlük özet) yok. Ham veri silinince geçmiş trend de kayboluyor.

---

## 14. Uygulama Sırası

### Temel işlevler
1. `git init`, pnpm workspace iskeleti, `.gitignore`, `.env.example`, docker-compose, DB healthcheck'leri
2. auth-service: register, login, me, users, JWT
3. monitoring-api: JWT middleware, monitor CRUD, tenant izolasyonu
4. measurements koleksiyonu + TTL index'leri (+ §8'deki doğrulama)
5. worker: semaphore, atomik claim, timeout, ölçüm yazma, graceful shutdown
6. Plan değişikliği: `PATCH /company/plan` + internal endpoint + `company_plans`
7. Rapor endpoint'i
8. README

### Ek geliştirmeler
9. Testler (§12)
10. Retry
11. SSRF istek anı kontrolü
12. Minimal frontend: giriş/kayıt, monitor listesi, 24 saatlik rapor kartı
13. Swagger (`/docs`)

### Zaman kalırsa
- History endpoint'i (saatlik gruplanmış seri)
- Monitor duraklatma (`PATCH /monitors/:id`)
- Plan bazlı limitler

### Son adım
Temiz bir ortamda `docker-compose up` ve ardından `scripts/smoke.sh` ile uçtan uca deneme.

---

## 15. Repo Yapısı

```
PingPulse/
├── package.json                 ← root: sadece workspace script'leri (test, lint)
├── pnpm-workspace.yaml          ← services/*, frontend
├── pnpm-lock.yaml               ← commit edilir
├── docker-compose.yml
├── .env.example
├── .gitignore                   ← node_modules, dist, .env
├── README.md
├── scripts/smoke.sh
├── services/
│   ├── auth/
│   │   ├── prisma/schema.prisma
│   │   └── src/
│   │       ├── server.ts        ← giriş: env doğrula, uygulamayı başlat, kapanışı yönet
│   │       ├── app.ts           ← Express uygulamasını kurar (testler de bunu kullanır)
│   │       ├── config/          ← env doğrulama
│   │       ├── database/        ← Prisma bağlantısı
│   │       ├── routes/          ← URL → middleware → controller eşlemesi
│   │       ├── middleware/      ← auth, validate, error
│   │       ├── controllers/     ← HTTP isteğini alır, servisi çağırır, yanıtı döner
│   │       ├── services/        ← iş mantığı
│   │       ├── validation/      ← Zod şemaları
│   │       ├── errors/          ← AppError + hata kodları
│   │       └── utils/           ← password, jwt
│   └── monitoring/
│       └── src/                 ← aynı katmanlar + worker.ts (worker girişi) ve checker/ (semaphore, http-checker, scheduler, ssrf)
└── frontend/                    ← (planlanan)
```
Katmanlı yapı tercih edildi: aynı türdeki dosyalar aynı klasörde durur. Servisler küçük olduğu için (auth 2 özellik, monitoring 4-5 özellik) bu ölçekte okunabilirlik açısından en anlaşılır yapı bu.
**Docker build:** Her servisin Dockerfile'ı repo kökünü context olarak alır. `pnpm install --frozen-lockfile --filter <servis>...` ile sadece o servisin bağımlılıkları kurulur, ardından `pnpm deploy --prod` ile bağımsız ve küçük bir runtime imajı üretilir. Multi-stage build kullanılır.
