# Авторизация AxMed

## Что уже подключено

- Apple Sign In через `expo-apple-authentication`.
- Единая модель `SocialAuthCredential` для передачи результата Apple/Google в backend.
- Обработка отмены входа, недоступного провайдера, повторного запуска и состояния загрузки.
- iOS bundle ID синхронизирован с App Store Connect: `com.anonymous.pochka2new`.
- Apple Team ID: `SAZ93YMRD7`; capability Sign In with Apple включена в Apple Developer.

## Google OAuth

OAuth-клиенты уже существуют в Google Cloud проекте `Axmed project`. Их публичные Client ID добавлены в приложение как значения по умолчанию. При необходимости их можно переопределить в локальном `.env` по примеру `.env.example`:

```dotenv
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=...
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=...
```

Это публичные идентификаторы OAuth-клиентов. Client secret в мобильное приложение добавлять нельзя.

Для iOS config plugin уже добавлен с URL scheme, полученной из iOS Client ID:

```json
[
  "@react-native-google-signin/google-signin",
  {
    "iosUrlScheme": "com.googleusercontent.apps.1067093205466-lt209nb5s2p05dovapkp9u7ac6qspu6l"
  }
]
```

Нативный Google Sign In не работает внутри Expo Go. Для проверки нужен development build.

Существующий Android OAuth-клиент использует package `com.anonymous.pochka2new`, а этот репозиторий — `com.axmed.mobile`. Перед Android-сборкой нужно согласовать окончательный package name и добавить OAuth-клиент с SHA-1 сертификата фактической development/production сборки. На iOS это расхождение не влияет.

## Контракт с backend

`AuthFlow` принимает необязательный callback:

```ts
onSocialAuthenticated?: (
  credential: SocialAuthCredential,
  mode: "signUp" | "signIn"
) => Promise<void> | void;
```

Backend должен:

1. Получить `credential.provider` и `credential.idToken`.
2. Проверить подпись токена у Google или Apple, issuer, audience, срок действия и nonce/state, если они будут добавлены.
3. Найти или создать пользователя AxMed.
4. Вернуть собственную сессию AxMed.

Токены провайдеров нельзя логировать. Имя и email Apple могут прийти только при первом разрешении пользователя, поэтому их нужно сохранить на backend при первом входе.

Сейчас callback не передан из `App.tsx`: интерфейс проходит дальше после успешного ответа провайдера, но постоянная серверная сессия ещё не создаётся.
