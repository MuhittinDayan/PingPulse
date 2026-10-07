# PingPulse

Çok şirketli bir uptime izleme servisi. Şirketler kayıt olur, izlemek istedikleri web sitelerinin URL'lerini ekler. Sistem bu URL'lere düzenli aralıklarla istek atar, yanıt süresini ve sitenin ayakta olup olmadığını kaydeder. Her şirket yalnızca kendi verisini görür. Ölçümler şirketin planına göre (Free 7, Pro 30, Enterprise 90 gün) otomatik olarak silinir.

## Ne yapar?

1. **Kayıt ve giriş:** Bir şirket ilk kullanıcısıyla birlikte kayıt olur ve JWT alır. Şirket kullanıcıları şirkete yeni kullanıcılar ekleyebilir.
2. **URL yönetimi:** Kullanıcı izlenecek URL'leri ekler, listeler, siler.
3. **Periyodik kontrol:** Worker zamanı gelen URL'lere istek atar. Aynı anda en fazla N istek atılır (`CHECK_CONCURRENCY`); yavaş ya da hatalı bir site diğerlerini etkilemez.
4. **Ölçüm kaydı:** Her kontrolün sonucu (ayakta mı, durum kodu, yanıt süresi, hata kodu) MongoDB time series koleksiyonuna yazılır.
5. **Plan bazlı saklama:** Ölçümler şirketin planına göre otomatik silinir. Plan değiştirilebilir.

## Mimari

```
                    ┌──────────────────┐
  İstemci ────────▶ │   auth-service   │ ──▶ PostgreSQL
     │              │     :3001        │      (companies, users)
     │ JWT          └────────┬─────────┘
     │                       │ plan değişikliği (X-Internal-Token)
     ▼                       ▼
┌─────────────────────────────────────────┐
│           monitoring-service            │
│  ┌──────────────────┐ ┌──────────────┐  │
│  │ monitoring-api   │ │ worker       │  │ ──▶ MongoDB
│  │ :3002            │ │ (arka plan)  │  │      (monitors, measurements, company_plans)
│  └──────────────────┘ └──────────────┘  │
└─────────────────────────────────────────┘
```

- **auth-service** şirketleri ve kullanıcıları yönetir, JWT üretir, plan değişikliğini yürütür.
- **monitoring-service** URL'leri ve ölçümleri yönetir. Aynı kod ve imajdan iki process çalışır: kullanıcıyla konuşan **API** ve URL'leri kontrol eden **worker**. Worker ayrı bir servis değil, aynı servisin ikinci process'idir; aynı veritabanını kullanır.
- **Servisler veritabanı paylaşmaz.** Ortak dil JWT'dir: auth imzalar, monitoring aynı secret ile doğrular ve her istekte auth'a sormaz. Servisler arası tek doğrudan çağrı plan değişikliğidir.

Her dosyanın ne yaptığı [docs/](docs/README.md) klasöründe anlatılır.

## Kurulum

Gereksinimler: Docker ve Docker Compose.

```bash
git clone <repo-adresi> && cd PingPulse
cp .env.example .env
```

`.env` içinde üç secret'ı doldurun (`POSTGRES_PASSWORD`, `JWT_SECRET`, `INTERNAL_TOKEN`). Rastgele değer üretmek için:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Ardından:

```bash
docker-compose up
```

İlk açılışta imajlar derlenir. Bütün servisler healthcheck'lerle birbirini bekler; `docker compose ps` ile hepsinin `healthy` olduğu görülebilir. Secret'lar eksikse compose hangi değişkenin eksik olduğunu yazıp durur.

| Servis | Adres |
|---|---|
| auth-service | http://localhost:3001 |
| monitoring-api | http://localhost:3002 |
| PostgreSQL (geliştirici erişimi) | localhost:5433 |
| MongoDB (geliştirici erişimi) | localhost:27018 |

Host portları, makinede yerel bir Postgres ya da MongoDB çalışıyorsa çakışmasın diye standart dışıdır.

### Örnek kullanım

```bash
# Kayıt (dönen accessToken'ı alın)
curl -X POST http://localhost:3001/auth/register -H "content-type: application/json" \
  -d '{"companyName":"Acme","email":"ali@acme.com","password":"supersecret1"}'

# URL ekle
curl -X POST http://localhost:3002/monitors -H "authorization: Bearer <TOKEN>" \
  -H "content-type: application/json" -d '{"url":"https://example.com"}'

# Planı değiştir
curl -X PATCH http://localhost:3001/company/plan -H "authorization: Bearer <TOKEN>" \
  -H "content-type: application/json" -d '{"plan":"PRO"}'
```

## API

| Servis | Method | Path | Açıklama |
|---|---|---|---|
| auth | POST | `/auth/register` | Şirket + ilk kullanıcı, token döner |
| auth | POST | `/auth/login` | Token döner |
| auth | GET | `/auth/me` | Kullanıcı ve şirket bilgisi |
| auth | POST | `/users` | Şirkete kullanıcı ekler |
| auth | GET | `/users` | Şirketin kullanıcıları |
| auth | PATCH | `/company/plan` | Planı değiştirir |
| monitoring | POST | `/monitors` | URL ekler |
| monitoring | GET | `/monitors` | Şirketin URL'leri |
| monitoring | DELETE | `/monitors/:id` | URL'yi ve ölçümlerini siler |

Hatalar tek formatta döner: `{ "statusCode": 409, "code": "EMAIL_ALREADY_REGISTERED", "message": "..." }`. `code` alanı sabittir ve istemci tarafında çeviri anahtarı olarak kullanılabilir.

## Mimari kararlar

**Teknolojiler:** Node.js 24, TypeScript, Express 5, Prisma 7, MongoDB driver, undici, Zod, pnpm monorepo, Docker Compose.

| Karar | Gerekçe |
|---|---|
| **2 mikroservis** | Kimlik ve kullanıcı yönetimi ile URL izleme farklı sorumluluklara sahiptir. Veri türleri (ilişkisel ↔ zaman serisi) ve yük karakterleri (seyrek giriş istekleri ↔ sürekli dış istekler) farklı olduğundan servisler bağımsız çalıştırılabilir ve ölçeklenebilir. Monitoring kapansa da giriş yapılabilir, auth kapansa da izleme devam eder. |
| **Worker, monitoring'in process'i** | Ayrı bir servis olsaydı monitoring'in veritabanını paylaşması gerekirdi. Aynı servisin ikinci process'i olarak hem veritabanı sahipliği korunuyor hem de API ile worker birbirinin yükünden etkilenmiyor. |
| **Express (katmanlı yapı)** | Her isteğin yolu route dosyasında satır satır okunur (`route → middleware → controller → service → repository`). İlk sürüm NestJS ile yazıldı, okunabilirlik için Express'e geçildi. |
| **Zod** | Hem ortam değişkenleri (açılışta fail-fast) hem request body doğrulaması. Veritabanı kuralları (UNIQUE, FK) buna ek olarak veriyi korur. |
| **undici (worker'da)** | Body'yi okumadan bırakma, yönlendirmeleri tek tek kontrol etme ve süre dolunca bağlantıyı gerçekten kapatma imkânı verir. Binlerce dış istek atan bir worker için kaynak kontrolü kritik. |
| **pnpm monorepo** | Tek lock dosyası, katı `node_modules` (phantom dependency yok). Servisler arasında paylaşılan kod paketi yoktur; her servis bağımsızdır. |

### Veritabanı seçimleri

**PostgreSQL (auth-service):** Veri az ama doğruluğu kritik ve ilişkisel. Şirket–kullanıcı ilişkisi foreign key ile, e-posta tekilliği UNIQUE ile korunur (eşzamanlı kayıtlarda bile). Şirket ve ilk kullanıcı tek transaction'da oluşur. Plan bir enum'dur ve boş olamaz. Prisma tip güvenli sorgular, migration yönetimi ve parametreli sorgular (SQL injection'a karşı) sağlar.

**MongoDB time series (monitoring-service):** Ölçüm verisi sürekli eklenir, hiç güncellenmez, hacimlidir ve hep zaman aralığına göre sorgulanır. Time series koleksiyonu ölçümleri bucket'larda gruplayıp sıkıştırır; index'ler ölçüm başına değil bucket başına tutulur. Native TTL ile silmeyi MongoDB yapar ve partial TTL index'leri sayesinde **farklı saklama süreleri tek koleksiyonda** uygulanabilir. `monitors` ve `company_plans` da monitoring'e ait olduğu için aynı veritabanında, normal koleksiyonlardadır.

### Tenant izolasyonu
- `companyId` her zaman doğrulanmış JWT'den okunur; body, query ya da path'ten gelen değere güvenilmez (şemada olmayan alanlar zaten atılır).
- Monitoring'de veritabanına erişen her fonksiyon `companyId` ister. Başka şirkete ait bir kaynak istenirse **404** döner (403 kaynağın var olduğunu sızdırır).

### Eşzamanlılık
- Kendi yazdığımız bir semaphore aynı anda en fazla `CHECK_CONCURRENCY` kontrolün çalışmasını sağlar. Slot yoksa monitor veritabanından **hiç alınmaz**; bellekte kuyruk birikmez.
- Monitor'ler `findOneAndUpdate` ile atomik olarak alınır; birden fazla worker çalışsa bile aynı URL iki kez kontrol edilmez.
- Her isteğin kesin bir timeout'u vardır (`AbortSignal`, yönlendirmeler ve body dahil). Bir kontrolün hatası diğerlerini ve döngüyü etkilemez; slot her durumda bırakılır.
- Doğrulama: N=5 ve 28 URL ile yapılan yük testinde hedef sunucuda aynı anda işlenen istek sayısı hiçbir an 5'i geçmedi.

## TTL yaklaşımı

| Plan | Saklama | Mekanizma |
|---|---|---|
| FREE | 7 gün | `meta.plan = FREE` filtreli partial TTL index |
| PRO | 30 gün | `meta.plan = PRO` filtreli partial TTL index |
| ENTERPRISE | 90 gün | Koleksiyon seviyesi `expireAfterSeconds` |

- Her ölçüm, yazıldığı andaki şirket planını `meta.plan` alanında taşır.
- **Partial TTL süreyi yalnızca kısaltabilir.** Bir ölçüme hem koleksiyon TTL'i hem partial index uyuyorsa kısa olan geçerlidir. Bu yüzden koleksiyon TTL'i en uzun plan olan Enterprise'ın 90 günüdür; bu aynı zamanda plan bilgisi eksik ya da hatalı ölçümler için bir güvenlik ağıdır.
- **Silme tam zamanında olmaz:** MongoDB'nin TTL monitörü 60 sn'de bir çalışır ve bucket'ları bütün olarak siler. Bucket'lar 1 saatlik olduğundan veri saklama süresini en fazla yaklaşık 1 saat aşabilir. Saklama süresi bir "silme eşiği"dir.
- **Koruma:** Servis açılırken `measurements` koleksiyonunun gerçekten time series olduğu doğrulanır; değilse servis açılmaz (normal koleksiyon olarak oluşmuşsa TTL sessizce çalışmazdı). Saklama süreleri kodda değişirse mevcut TTL'ler otomatik eşitlenir.
- **Doğrulama:** Gerçek MongoDB 7.0 üzerinde TTL monitörü 1 sn'ye indirilerek test edildi: FREE@8 gün, PRO@31 gün, ENTERPRISE@91 gün ölçümleri silindi; PRO@8 gün ve ENTERPRISE@31 gün kaldı.

### Plan değişirse ne olur? (snapshot politikası)
Her ölçüm **yazıldığı andaki planın** saklama süresine tabidir; eski ölçümlere dokunulmaz.
- Free → Pro: eski ölçümler 7 günde silinir, yeni ölçümler 30 gün saklanır.
- Pro → Free: eski ölçümler kendi 30 gününü doldurur, yeni ölçümler 7 gün saklanır.

**Gerekçe:** Time series üzerinde toplu güncelleme ve buna bağlı yarış durumları olmaz. "Her ölçüm alındığı andaki sözleşmenin şartlarına tabidir" kuralı açık ve savunulabilir.

**Akış:** auth-service önce monitoring'e bildirir (idempotent upsert), sonra Postgres'i günceller. Monitoring'e ulaşılamazsa 503 döner ve hiçbir şey değişmez. Aynı şirketin eşzamanlı plan değişiklikleri Postgres advisory lock ile sıraya girer. Worker planı 30 sn önbellekte tuttuğu için değişiklik en geç 30 sn içinde yeni ölçümlere yansır.

## Bilinen eksikler

- **24 saatlik rapor endpoint'i (`GET /monitors/:id/report`) henüz yazılmadı.** Hesap tanımı PLAN.md §10'da hazır.
- **Otomatik testler henüz yok.** TTL, eşzamanlılık, tenant izolasyonu ve plan değişikliği elle doğrulandı; testler `node:test` ile yazılacak.
- **At-most-once kontrol:** Worker bir monitor'ü aldıktan hemen sonra çökerse o aralıktaki kontrol atlanır.
- **Toplu kesinti:** Sitelerin çoğu timeout'a düşerse kapasite N / timeout'a iner ve kontroller gecikir. Gecikme her ölçümde `scheduleLagMs` olarak kaydedilir.
- **Retry yok** (geçici ağ hatalarında tekrar deneme).
- **SSRF koruması kısmi:** Literal özel IP'ler ve `localhost` eklenirken reddedilir. Alan adlarının istek anında hangi IP'ye çözüldüğü (DNS rebinding) ve yönlendirmelerdeki IP'ler henüz kontrol edilmiyor.
- **Roller yok:** Şirketteki her kullanıcı aynı yetkiye sahip; herhangi bir kullanıcı planı değiştirebilir. Ödeme sistemi yok.
- **Token iptali yok:** Refresh token yok; JWT süresi (varsayılan 1 saat) dolana kadar geçerlidir.
- **HS256 ortak secret:** Production için RS256/JWKS önerilir.
- **Plan senkronizasyonu senkron HTTP:** Monitoring yazıp geç yanıt verirse ya da Postgres güncellemesi başarısız olursa iki taraf ayrışabilir; kullanıcı 503 görür ve isteği tekrarlaması düzeltir. Production için outbox + mesaj kuyruğu ya da periyodik uzlaştırma önerilir.
- **Internal endpoint** public API ile aynı portta, sadece `X-Internal-Token` ile korunuyor.
- **TTL gecikmesi:** Silme en fazla yaklaşık 1 saat gecikebilir.
- **Downsampling yok:** Ham veri silinince uzun vadeli trend de kaybolur.
- **Domain sahipliği doğrulanmıyor;** bot korumalı siteler 403 dönebilir.
- **Frontend yok.**
