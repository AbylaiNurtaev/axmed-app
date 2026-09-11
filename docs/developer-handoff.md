# Передача проекта разработчику

## Git и совместная работа

Основная интеграционная ветка — `main`. `feature/auth-onboarding` сохраняется как история работы над авторизацией, onboarding и браслетом.

Перед обновлением сохраните свои незакоммиченные изменения в собственной ветке. Для чистой рабочей копии:

```powershell
git fetch origin
git switch main
git pull --ff-only origin main
git switch -c feature/my-next-task
```

Дальнейшие изменения отправляйте из своей feature-ветки через Pull Request в `main`. Если локальный `main` уже содержит собственные коммиты, не используйте `reset --hard`: сначала согласуйте их объединение. Ветки коллег не удалять без согласования.

## Локальный запуск

Нужны Node.js 22+, npm и Docker Desktop. Из корня проекта:

```powershell
npm ci
npm ci --prefix server
if (!(Test-Path .env)) { Copy-Item .env.example .env }
if (!(Test-Path server/.env)) { Copy-Item server/.env.example server/.env }
npm run db:up
npm run api:dev
```

В другом терминале:

```powershell
npx expo start --dev-client --lan --port 8081
```

В корневом `.env` задайте `EXPO_PUBLIC_API_URL=http://<LAN-IP-вашего-компьютера>:4000`. Компьютер и телефон должны быть в одной сети. Сервер читает **`server/.env`**, поскольку npm-команда запускается из `server/`. Не перепутайте его с корневым Expo `.env`.

API и БД запускаются локально; `GET /health` проверяет доступ к PostgreSQL. Перенос Git не переносит пользовательские записи БД. Для обычной разработки используйте собственную тестовую БД, не копируйте медицинские данные пользователей.

## Секреты и SMTP

В Git находятся только `.env.example` и `server/.env.example`. `.env`, `server/.env`, файлы подписи, ключи и логи исключены через `.gitignore`. Сам `.gitignore` не защищает от `git add -f` и не удаляет ранее опубликованные секреты.

Рекомендуемая передача:

1. Для разработки используйте отдельную dev-почту и отдельный пароль приложения Gmail, а не основной пароль Google. Уже отправленный открытым текстом пароль следует отозвать и заменить у владельца почты. [Управление паролями приложений Google](https://support.google.com/accounts/answer/185833).
2. Передайте только нужные SMTP-переменные через менеджер паролей/секретов. Для разовой передачи можно использовать [Bitwarden Send](https://bitwarden.com/help/create-send/) с коротким сроком действия, паролем доступа и ограничением просмотров. Пароль доступа к ссылке передайте другим каналом. Не вставляйте секреты в GitHub Issues, PR, README или URL.
3. Получатель вручную заполняет `server/.env` на своей машине. В репозиторий этот файл не отправляется. После изменения SMTP перезапустите API.

Шаблон набора для передачи (ниже НЕТ действующего пароля):

```dotenv
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-dev-mailbox@gmail.com
SMTP_PASSWORD=<отдельный пароль приложения из защищённого канала>
SMTP_FROM=AxMed <your-dev-mailbox@gmail.com>
```

`SMTP_FROM` должен соответствовать отправляющему ящику или разрешённому адресу. Для проверки настоящего email-кода удалите/очистите `AUTH_FIXED_VERIFICATION_CODE`, задайте `AUTH_EXPOSE_DEV_CODE=false`. Для локальной работы без почты допустим `AUTH_EXPOSE_DEV_CODE=true`; фиксированный `111111` — только явно включаемый режим разработки, не production.

Для своей локальной БД создайте собственный `JWT_SECRET` (минимум 32 символа), например `node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"`. Его не нужно делать одинаковым у всех разработчиков. При подключении к общему backend мобильному приложению вообще не нужны его SMTP/JWT/DB-секреты — только URL API.

Все `EXPO_PUBLIC_*` доступны в мобильном bundle. Туда нельзя помещать SMTP-пароль, JWT_SECRET, приватные ключи или production DATABASE_URL. Google OAuth client ID, Apple bundle ID и EAS project ID — публичные идентификаторы, не пароли.

Для общего dev/staging/production сервера задавайте секреты в настройках окружения хостинга. GitHub Actions Secrets предназначены для задач CI/CD, не для скачивания готового `.env` разработчиками. [Документация GitHub](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets).

## Браслет и iOS

- SDK bridge: `modules/axmed-hband`; общий контракт: `src/devices`; UI: `src/features/devices`; API: `server/src/deviceService.ts`.
- Детали и ограничения: [wearables-sync.md](wearables-sync.md). Базовые заряд/шаги/сон проверены пользователем на G72. Расширенные показатели требуют проверки после установки v2.
- Свежая dev-сборка: [78a9991b — синхронизация v2](https://expo.dev/accounts/axmed-project/projects/axmed/builds/78a9991b-0634-4909-b74b-579bce47e1f7). Ссылки internal build имеют срок действия; актуальные сборки смотрите в EAS.
- Для Bluetooth нужен **native development client**, не Expo Go. UI/JS правки приходят через Metro. Правки Swift/подключённых native-библиотек требуют новой сборки.
- Сторонние SDK-бинарники **не хранятся в Git**. Нужен тот же комплект HBand iOS SDK **2.2.98.15**; не подменяйте его произвольной новой версией. [Источник SDK](https://github.com/HBandSDK/iOS_Ble_SDK). На Windows импортируйте комплект через `powershell -ExecutionPolicy Bypass -File scripts/import-hband-sdk.ps1 -SdkPath "C:\path\to\iOS_Ble_SDK-master"`, затем `npm run devices:verify-sdk`. Скрипт сверяет хеши с `vendor-manifest.json` и не перезаписывает существующий Vendor.
- EAS: `@axmed-project/axmed`, существующие Bundle ID/Apple Team сохраняются. Попросите владельца выдать доступ к проекту и зарегистрировать новый iPhone для internal distribution. Пароль Apple ID и файлы подписи друг другу через Git не передавать.
- Перед синхронизацией отключите G72 в G Band; один браслет не должен одновременно обслуживаться двумя приложениями.

Главная страница приложения за пределами карточки браслета ещё содержит демонстрационные данные (включая оценку `84/100`). Они не вычисляются из показаний G72. Этот merge не означает готовность приложения к production или клинической интерпретации показателей.

## Проверки перед PR

```powershell
npm run typecheck
npm run api:typecheck
npm run devices:test
node --test tests/profile-logout.test.cjs
npm run api:test
npm run devices:test-api
npm run devices:test-build
```

`devices:test-api` использует локальную PostgreSQL, создаёт временные тестовые аккаунты и удаляет только их. Swift-тест `npm run devices:test-native` выполняется на macOS и автоматически в EAS. Проверки не заменяют ручной BLE-тест на физическом устройстве.
