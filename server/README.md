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
| POST | `/api/auth/social` | Войти или зарегистрироваться через Google/Apple |
| POST | `/api/auth/refresh` | Ротировать refresh-токен |
| POST | `/api/auth/logout` | Отозвать refresh-токен |

## Безопасность

- Пароли хешируются `scrypt` с индивидуальной случайной солью.
- Коды одноразовые, живут ограниченное время и блокируются после пяти ошибок.
- Access JWT действует 15 минут по умолчанию.
- Refresh-токены хранятся в БД только в виде SHA-256 hash и ротируются.
- SQL-параметры передаются через parameterized queries.
- Включены Helmet, ограничение размера JSON, rate limiting и `Cache-Control: no-store`.
- Google и Apple ID tokens проверяются по официальным JWKS, issuer, audience и expiration.

Для временной локальной проверки можно задать `AUTH_FIXED_VERIFICATION_CODE=111111` в `server/.env`; сервер игнорирует эту настройку при `NODE_ENV=production`.

Для production обязательно замените `JWT_SECRET`, настройте HTTPS, SMTP, точный `CORS_ORIGIN` и отключите `AUTH_EXPOSE_DEV_CODE`.
