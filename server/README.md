# AxMed API

API реализует регистрацию и вход по email/паролю, подтверждение email, Google/Apple Sign In, обновление и отзыв сессий.

## Запуск

Из корня репозитория:

```powershell
npm install --prefix server
Copy-Item server/.env.example server/.env
npm run db:up
npm run api:dev
```

API слушает `0.0.0.0:4000`, health check: `GET /health`. Таблицы создаются идемпотентно при старте.

## Маршруты

| Метод | Маршрут | Назначение |
|---|---|---|
| POST | `/api/auth/register` | Создать email-аккаунт и отправить код |
| POST | `/api/auth/verify-email` | Подтвердить код и создать сессию |
| POST | `/api/auth/resend-code` | Отправить новый код |
| POST | `/api/auth/login` | Войти по email и паролю |
| POST | `/api/auth/password-reset/request` | Запросить код восстановления: `{ email }` |
| POST | `/api/auth/password-reset/verify` | Обменять `{ email, code }` на одноразовый `resetToken` |
| POST | `/api/auth/password-reset/complete` | Установить пароль: `{ email, resetToken, password }`, ответ 204 |
| POST | `/api/auth/social` | Войти или зарегистрироваться через Google/Apple |
| POST | `/api/auth/refresh` | Ротировать refresh-токен |
| POST | `/api/auth/logout` | Отозвать refresh-токен |

## Безопасность

- Пароли хешируются `scrypt` с индивидуальной случайной солью.
- Коды одноразовые, живут ограниченное время и блокируются после пяти ошибок.
- Вход: 5 ошибок за 15 минут → пауза 5 минут; счётчик в PostgreSQL.
- Восстановление: код 10 минут, разрешение сброса 5 минут, отправка раз в 60 секунд и до 5 раз в час на адрес.
- Смена пароля отзывает все сессии, включая access JWT, и аннулирует остальные коды/разрешения.
- Access JWT действует 15 минут по умолчанию.
- Refresh-токены хранятся в БД только в виде SHA-256 hash и ротируются.
- SQL-параметры передаются через parameterized queries.
- Включены Helmet, ограничение размера JSON, rate limiting и `Cache-Control: no-store`.
- Google и Apple ID tokens проверяются по официальным JWKS, issuer, audience и expiration.

Для временной локальной проверки можно задать `AUTH_FIXED_VERIFICATION_CODE=111111` в `server/.env`; сервер игнорирует эту настройку при `NODE_ENV=production`.
Это касается только регистрации. Восстановление всегда требует почтовый сервис, использует случайный код и не возвращает его в JSON.

Из корня проекта: `npm run api:test:password-recovery` проверяет новую авторизацию на отдельной
временной БД с локальным SMTP-приёмником. Настоящие адреса и данные основной базы не используются.

Для production обязательно замените `JWT_SECRET`, настройте HTTPS, почтовый сервис, точный `CORS_ORIGIN` и отключите `AUTH_EXPOSE_DEV_CODE`.

На Railway Free/Trial/Hobby обычный SMTP заблокирован: используйте Resend или Brevo
через HTTPS API. Настройка и проверка описаны в [EMAIL_DELIVERY.md](EMAIL_DELIVERY.md).
