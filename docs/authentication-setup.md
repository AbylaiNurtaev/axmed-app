# Авторизация AxMed

## Реализованный сценарий

- Регистрация по email требует пароль: минимум 8 символов, хотя бы одна буква и одна цифра.
- Новый email подтверждается шестизначным одноразовым кодом.
- После подтверждения пользователь завершает onboarding.
- Повторный вход выполняется по email и паролю без кода.
- Активная сессия восстанавливается при запуске приложения.
- Выход отзывает серверную сессию и очищает защищённое хранилище телефона.
- Google и Apple credentials отправляются в API и проверяются на сервере.

## Локальная разработка

PostgreSQL запускается через `docker-compose.yml`. Скопируйте оба шаблона окружения и не коммитьте реальные `.env`:

```powershell
Copy-Item .env.example .env
Copy-Item server/.env.example server/.env
npm run db:up
npm run api:dev
```

Для физического телефона `EXPO_PUBLIC_API_URL` должен содержать IP компьютера в локальной сети. `localhost` на телефоне указывает на сам телефон.

Без настроенного SMTP сервер в development-режиме возвращает код в поле `verificationCode`, и приложение показывает его подписью «Локальный код». Это поведение запрещено в production и автоматически дополнительно ограничено проверкой `NODE_ENV !== production`.

## SMTP

Для реальной отправки писем заполните в `server/.env`:

```dotenv
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=...
SMTP_PASSWORD=...
SMTP_FROM=AxMed <no-reply@example.com>
AUTH_EXPOSE_DEV_CODE=false
```

## Google OAuth

Мобильные Client ID задаются через `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` и `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`. Эти идентификаторы публичные; Client secret в Expo добавлять нельзя.

API принимает разрешённые audience через `GOOGLE_CLIENT_IDS`. Он проверяет подпись Google ID token, issuer, audience и срок действия. Нативный Google Sign In требует development build и не работает внутри Expo Go.

Android package в приложении сейчас `com.axmed.mobile`. Для Android OAuth нужен клиент именно с этим package и SHA-1 сертификата development/production сборки.

## Apple Sign In

iOS bundle ID: `com.anonymous.pochka2new`, Team ID: `SAZ93YMRD7`. API использует bundle ID как `APPLE_CLIENT_ID` и проверяет Apple ID token по официальному JWKS, issuer, audience и сроку действия.

Имя Apple может прийти только при первом разрешении, поэтому API сохраняет его при создании аккаунта. Для production-hardening следующим шагом следует добавить server-issued nonce и обмен authorization code на Apple refresh token.

## Сессии

API возвращает короткий access JWT и случайный refresh-токен. На устройстве refresh-токен хранится в Expo SecureStore; в PostgreSQL хранится только его hash. При восстановлении сессии токен ротируется, а старый сразу отзывается.

Переменные `JWT_SECRET`, SMTP-пароль и строка подключения к production PostgreSQL являются серверными секретами и никогда не должны попадать в мобильный bundle.
