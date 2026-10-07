# monitoring-service

URL'leri izler ve ölçümleri saklar. Veritabanı: MongoDB. Aynı kod ve aynı imajdan iki process çalışır:

- **monitoring-api** (`server.ts`, port 3002): kullanıcıyla konuşan HTTP API.
- **monitoring-worker** (`worker.ts`): arka planda URL'leri kontrol eden process.

İkisi aynı veritabanını kullanır; worker ayrı bir servis değil, bu servisin ikinci process'idir. Böylece "her servis kendi veritabanını kullanır" kuralı korunur ve API ile worker birbirinin yükünden etkilenmez.

## Koleksiyonlar

| Koleksiyon | İçerik | Tip |
|---|---|---|
| `monitors` | İzlenen URL'ler | Normal |
| `measurements` | Worker'ın yazdığı ölçümler | **Time series**, TTL ile otomatik silinir |
| `company_plans` | auth'taki şirket planının kopyası | Normal |

## Endpoint'ler (monitoring-api)

| Method | Path | Koruma | Açıklama |
|---|---|---|---|
| POST | `/monitors` | JWT | URL ekler (201) |
| GET | `/monitors` | JWT | Şirketin URL'leri |
| DELETE | `/monitors/:id` | JWT | URL'yi ve ölçümlerini siler (204) |
| PUT | `/internal/companies/:companyId/plan` | `X-Internal-Token` | Sadece auth-service çağırır |
| GET | `/health` | – | MongoDB'ye ping atar |

## Klasör yapısı

```
services/monitoring/
├── Dockerfile
├── package.json
├── tsconfig.json, tsconfig.build.json
└── src/
    ├── server.ts         (API girişi)
    ├── worker.ts         (worker girişi)
    ├── app.ts
    ├── config/
    ├── database/
    ├── repositories/
    ├── checker/          (worker'ın parçaları)
    ├── routes/
    ├── middleware/
    ├── controllers/
    ├── services/
    ├── validation/
    ├── errors/
    ├── utils/
    └── types/
```

## Proje dosyaları

| Dosya | Ne yapar |
|---|---|
| `Dockerfile` | İki aşamalı build. API ve worker aynı imajı kullanır; compose'da worker'ın komutu `node dist/worker.js`. `CMD` exec formunda olduğu için Node doğrudan PID 1'dir ve SIGTERM'ü alır. |
| `package.json` | Bağımlılıklar: express, mongodb, undici, ipaddr.js, jsonwebtoken, zod. |

## Giriş noktaları

| Dosya | Ne yapar |
|---|---|
| `server.ts` | API: env doğrula → MongoDB'ye bağlan → `setupDatabase` → dinle. Setup bitmeden istek kabul edilmez; setup başarısızsa servis hiç açılmaz. |
| `worker.ts` | Worker: env doğrula → MongoDB'ye bağlan → `setupDatabase` → scheduler'ı başlat. SIGTERM'de scheduler'ı durdurur (devam eden kontrolleri bekler), sonra bağlantıyı kapatır. |
| `app.ts` | API'nin Express uygulaması; repository → servis → controller → route bağlantıları. |

## config/

| Dosya | Ne yapar |
|---|---|
| `env.ts` | API ve worker için ayrı şemalar (worker JWT secret'ı bilmez). Worker şeması `UV_THREADPOOL_SIZE >= CHECK_CONCURRENCY` koşulunu ister: DNS çözümlemesi libuv thread pool'unu kullanır (varsayılan 4 thread); pool eşzamanlı kontrol sayısından küçükse yavaş bir DNS sunucusu diğer kontrollerin DNS çözümlemesini geciktirebilir. Pool boyutu process başladıktan sonra değiştirilemediği için yanlış ayarda worker açılmaz. |
| `retention.ts` | Saklama sürelerinin tek kaynağı: FREE 7, PRO 30, ENTERPRISE 90 gün (saniye cinsinden). `Record<Plan, number>`: yeni bir plan eklenip süresi yazılmazsa derleme hata verir. |

## database/

| Dosya | Ne yapar |
|---|---|
| `setup.ts` | API ve worker açılışta çağırır; her adım idempotent'tir. **1)** `monitors` index'leri: `company_url_unique` (aynı şirkette aynı URL bir kez) ve `due_monitors` (worker zamanı gelenleri hızlı bulsun). **2)** `measurements` time series koleksiyonu: `timeField: timestamp`, `metaField: meta`, bucket'lar 1 saatlik (`bucketMaxSpanSeconds = bucketRoundingSeconds = 3600`), koleksiyon TTL'i 90 gün. Koleksiyon zaten varsa gelen 48 (NamespaceExists) hatası yutulur (API ve worker aynı anda açılabilir). Koleksiyon time series **değilse** servis durur: bir `insertOne` setup'tan önce çalışırsa MongoDB koleksiyonu normal olarak oluşturur ve TTL sessizce çalışmaz. Koleksiyon TTL'i koddakinden farklıysa `collMod` ile düzeltilir. **3)** Partial TTL index'leri: `ttl_free` (`meta.plan = FREE`, 7 gün), `ttl_pro` (`meta.plan = PRO`, 30 gün). Süre farklıysa index silinip yeniden oluşturulur; time series'te index TTL'i `collMod` ile değiştirilemez (denenerek görüldü). **4)** `monitor_time` `{ meta.monitorId, timestamp }`: rapor sorguları için (ESR: önce eşitlik, sonra aralık). |

**TTL nasıl çalışır:** Partial TTL süreyi yalnızca kısaltabilir; bir ölçüme hem koleksiyon TTL'i hem partial index uyuyorsa kısa olan geçerli olur. Bu yüzden koleksiyon TTL'i en uzun plan olan ENTERPRISE'ın süresidir ve plansız/hatalı ölçümler için de güvenlik ağıdır. TTL monitörü 60 sn'de bir çalışır ve bucket'ları bütün olarak siler; bir bucket içindeki en yeni ölçümün süresi dolmadan silinmez. Bu yüzden veri süresini en fazla yaklaşık 1 saat aşabilir.

## repositories/

Veritabanına erişen tek katman. API'nin kullandığı her fonksiyon `companyId` parametresini zorunlu alır; başka şirketin verisine erişen bir sorgu bu katmandan yazılamaz.

| Dosya | Ne yapar |
|---|---|
| `monitors.repository.ts` | `insert`, `listByCompany`, `deleteById`. **`claimNextDue`** (tek istisna, sadece worker kullanır): zamanı gelmiş en eski monitor'ü alır ve `nextCheckAt`'i aynı işlemde "şimdi + aralık" yapar (`findOneAndUpdate`). İşlem atomik olduğu için iki worker aynı monitor'ü alamaz. Güncelleme öncesi hali döner (`returnDocument: 'before'`); içindeki `nextCheckAt` planlanan zamandır ve gecikme hesabında kullanılır. "Planlanan + aralık" değil "şimdi + aralık": worker kapalı kaldıysa kaçırılan kontroller art arda yapılmaz. `isDuplicateKey`: 11000 hatasını tanır. |
| `measurements.repository.ts` | Ölçüm dokümanı: `timestamp`, `meta: { companyId, monitorId, plan }`, `isUp`, `statusCode`, `responseTimeMs`, `errorCode`, `scheduleLagMs`. `plan` ölçümün yazıldığı andaki plandır (snapshot) ve `meta` içinde olmak zorundadır: time series'te partial TTL filtresi sadece metaField üzerinde olabilir. Yanıt gelmediyse `statusCode` ve `responseTimeMs` `null`'dır (0 yazmak "0 ms'de yanıt verdi" anlamına gelirdi). `deleteByMonitor`. |
| `company-plans.repository.ts` | `findPlan`: kaydı olmayan şirket FREE kabul edilir (kayıt sırasında senkronizasyon gerekmez). `upsertPlan`: kayıt yoksa oluşturur, varsa günceller; tekrarlanması sonucu değiştirmez. |

## checker/ (worker)

| Dosya | Ne yapar |
|---|---|
| `semaphore.ts` | Aynı anda en fazla `max` iş. `tryAcquire` beklemez: yer yoksa hemen `false` döner ve monitor hiç alınmaz. Bekleme kuyruğu bellekte değil veritabanındadır (monitor'ler `nextCheckAt` sırasıyla bekler); worker çökünce kaybolacak ya da 10 bin monitor'de şişecek bir kuyruk yoktur. `release` alınandan fazla bırakılırsa hata fırlatır; aksi halde sayaç eksiye düşer ve limit sessizce aşılırdı. Kütüphane değil, kendi 20 satırlık sınıfımız. |
| `scheduler.ts` | Worker'ın kalbi. Her `WORKER_TICK_MS`'de ve her kontrol bittiğinde slotları doldurur: **önce slot alınır, sonra monitor** (`claimNextDue`); slot yoksa monitor'e dokunulmaz. Kontrol beklenmeden başlatılır; bitince ölçüm yazılır, slot `finally` ile **mutlaka** bırakılır ve hemen yeni slot doldurulur (bir sonraki tick beklenmez). Aynı anda tek bir doldurma döngüsü çalışır. `runCheck` her hatayı yakalar: bir monitor'deki sorun diğerlerini ve döngüyü etkilemez. `scheduleLagMs` = başlangıç − planlanan zaman. **stop():** yeni monitor alınmaz → o an süren claim (varsa) beklenir → başlamış bütün kontroller beklenir (`Promise.allSettled`). |
| `http-checker.ts` | undici `request` ile GET. Tek bir `AbortSignal.timeout` bütün yönlendirme zincirini ve body'yi kapsar; süre dolunca bağlantı gerçekten kapanır (gerçek iptal; `Promise.race` sadece beklemeyi bırakırdı). Yönlendirmeler elle takip edilir (en fazla 5). Body okunmaz, `dump({ limit: 64 KB })` ile bırakılır; bırakılmazsa socket havuza dönmez ve bağlantı sızar. Body süre içinde gelmezse de `TIMEOUT` sayılır. `responseTimeMs` son yanıtın header'larına kadar geçen süredir. UP = 200–399. Hata kodları: `TIMEOUT` (undici'nin kendi bağlantı/header/body timeout'ları dahil), `DNS_ERROR`, `CONN_REFUSED`, `TLS_ERROR`, `HTTP_ERROR` (beklenmeyen durum kodu ya da 5'ten fazla yönlendirme), `UNKNOWN`. Fonksiyon hata fırlatmaz, her durumda bir sonuç döner. |
| `plan-cache.ts` | Her ölçümde DB'ye plan sorgusu atmamak için planı 30 sn bellekte tutar. Plan değişikliği en geç 30 sn içinde yansır. Süresi dolan kayıtlar 30 sn'de bir temizlenir. `now` parametre olarak verilebilir (testte zamanı simüle etmek için). |

## Diğer katmanlar

| Dosya | Ne yapar |
|---|---|
| `routes/monitors.routes.ts` | Router seviyesinde JWT koruması; POST, GET, DELETE. |
| `routes/internal.routes.ts` | Router seviyesinde `X-Internal-Token` koruması; kullanıcı JWT'si burada geçerli değildir. |
| `routes/health.routes.ts` | MongoDB'ye `ping`. |
| `middleware/auth.middleware.ts` | auth-service'teki ile aynı mantık (token sadece doğrulanır). |
| `middleware/internal-auth.middleware.ts` | `X-Internal-Token` kontrolü. Karşılaştırma sabit sürelidir (`timingSafeEqual`): `===` ilk farklı karakterde durur ve yanıt süresinden token tahmin edilebilir. İki değer önce SHA-256 ile eşit uzunluğa getirilir, böylece uzunluk da sızmaz. |
| `middleware/validate.middleware.ts`, `middleware/error.middleware.ts` | auth-service'teki ile aynı. |
| `controllers/monitors.controller.ts` | create (201), list, remove (204). `companyId` token'dan. |
| `controllers/internal.controller.ts` | setPlan (204). |
| `services/monitors.service.ts` | **create:** URL'yi çözer; `ALLOW_PRIVATE_TARGETS` kapalıysa literal özel/yerel adresleri reddeder (SSRF); `name` verilmediyse host adını kullanır; `nextCheckAt: now` ile ilk kontrol hemen yapılır; aynı şirkette aynı URL varsa 409. **remove:** önce monitor silinir (worker onu tekrar alamasın), sonra ölçümleri. Ölçüm silme monitor bulunamasa da çalışır: yarıda kalmış silmeler ve silme anında yazılmış sahipsiz ölçümler tekrar edilen DELETE ile temizlenir (filtrede `companyId` olduğu için başka şirketin verisine dokunulamaz). Başka şirketin monitor'ü 403 değil 404 döner; 403 kaynağın var olduğunu sızdırır. |
| `services/company-plans.service.ts` | `companyId` UUID değilse 400; planı upsert eder. Eski ölçümlere dokunulmaz (snapshot). |
| `validation/monitors.schemas.ts` | URL: kırpılır, en fazla 2048 karakter, sadece `http`/`https`. `name`: 1–100 karakter, isteğe bağlı. |
| `validation/internal.schemas.ts` | Plan enum'u ve `companyId` UUID şeması. |
| `utils/url.ts` | **normalizeUrl:** WHATWG URL şema ve host'u küçük harfe çevirir, varsayılan portu atar ve aynı karakterin farklı kodlamalarını tek biçime indirir; biz sadece `#fragment`'ı atarız. Query parametrelerinin sırası ve değerleri değişmez. **isPrivateHost:** IPv6 köşeli parantezlerini ve sondaki noktayı (`localhost.`) temizler; `localhost` ve `*.localhost` reddedilir; literal IP ise `ipaddr.process(ip).range() !== 'unicast'` kuralıyla private, loopback, link-local, CGNAT, multicast, reserved aralıkların hepsi ve IPv4-mapped IPv6 reddedilir. `0x7f000001` gibi yazımları URL parser zaten `127.0.0.1`'e çevirdiği için bunlar da yakalanır. Alan adlarının hangi IP'ye çözüldüğü burada kontrol edilmez (DNS rebinding koruması istek anında yapılacak, PLAN §7). |
| `utils/jwt.ts` | `TokenVerifier`: token'ı auth-service imzalar, bu servis sadece doğrular (HS256, `exp` zorunlu). |
| `errors/app-error.ts`, `types/express.d.ts` | auth-service'teki ile aynı mantık. |
