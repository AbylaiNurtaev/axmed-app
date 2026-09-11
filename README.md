# AxMed

Мобильное приложение на React Native / Expo и API авторизации на Node.js / PostgreSQL.

Инструкция второму разработчику: [запуск, совместная работа, секреты и SDK](docs/developer-handoff.md).
Синхронизация G72: [поддерживаемые данные и ограничения](docs/wearables-sync.md).

## Локальный запуск

Требования: Node.js 22+, npm и Docker Desktop.

```powershell
npm install
npm install --prefix server
Copy-Item .env.example .env
Copy-Item server/.env.example server/.env
npm run db:up
npm run api:dev
```

В отдельном терминале:

```powershell
npm start
```

При запуске на физическом телефоне укажите в `.env` LAN-адрес компьютера, например:

```dotenv
EXPO_PUBLIC_API_URL=http://192.168.1.100:4000
```

Телефон и компьютер должны быть в одной Wi-Fi сети. Для iOS Simulator используется `http://localhost:4000`, для Android Emulator — `http://10.0.2.2:4000`.

## Авторизация

- Регистрация: email + пароль → шестизначный код → onboarding.
- Вход: email + пароль → сразу в приложение, без повторного email-кода.
- Google и Apple: нативный ID token проверяется API, затем создаётся серверная сессия.
- Refresh-токен хранится через Expo SecureStore и ротируется при восстановлении сессии.
- Выход отзывает refresh-токен на сервере и удаляет его с устройства.

В локальном режиме без SMTP код показывается на экране подтверждения. Для production установите SMTP-переменные в `server/.env` и задайте `AUTH_EXPOSE_DEV_CODE=false`.

## Проверки

```powershell
npm run typecheck
npm run api:typecheck
npm run api:test
npm run api:test:integration
npx expo export --platform web
```

Интеграционный тест требует запущенную PostgreSQL (`npm run db:up`). Подробности находятся в [server/README.md](server/README.md) и [docs/authentication-setup.md](docs/authentication-setup.md).
