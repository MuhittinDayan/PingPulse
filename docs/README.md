# PingPulse Dokümantasyonu

Kod içinde yorum satırı yoktur. Her dosyanın ne iş yaptığı ve önemli tasarım kararlarının gerekçeleri bu klasörde anlatılır.

| Doküman | İçerik |
|---|---|
| [genel-yapi.md](genel-yapi.md) | Repo kökündeki dosyalar: monorepo, docker-compose, ortam değişkenleri |
| [auth-service.md](auth-service.md) | auth-service'in her dosyası ve görevi |
| [monitoring-service.md](monitoring-service.md) | monitoring-service'in (API + worker) her dosyası ve görevi |
| [../PLAN.md](../PLAN.md) | Proje planı, mimari kararlar ve gerekçeleri |

## Katmanlar

İki servis de aynı katmanlı yapıyı kullanır. Bir HTTP isteği şu sırayla ilerler:

```
routes → middleware → controllers → services → repositories / database
```

| Katman | Sorumluluk | HTTP'yi bilir mi? |
|---|---|---|
| `routes/` | Hangi URL hangi middleware ve controller'dan geçecek | Evet |
| `middleware/` | Kimlik doğrulama, body doğrulama, hata formatı | Evet |
| `controllers/` | HTTP isteğini alır, servisi çağırır, yanıtı döner | Evet |
| `services/` | İş mantığı | Hayır |
| `repositories/`, `database/` | Veritabanı erişimi | Hayır |
| `validation/` | Zod şemaları | Hayır |
| `config/` | Ortam değişkenlerinin doğrulanması | Hayır |
| `errors/` | `AppError` ve sabit hata kodları | Hayır |
| `utils/` | Yardımcılar (jwt, şifre, url) | Hayır |
