# Авторизация AxMed

## Что уже подключено

- Apple Sign In через `expo-apple-authentication`.
- Единая модель `SocialAuthCredential` для передачи результата Apple/Google в backend.
- Обработка отмены входа, недоступного провайдера, повторного запуска и состояния загрузки.
- iOS bundle ID синхронизирован с App Store Connect: `com.anonymous.pochka2new`.
- Apple Team ID: `SAZ93YMRD7`; capability Sign In with Apple включена в Apple Developer.

## Google OAuth

После создания OAuth-клиентов в Google Cloud заполнить локальный `.env` по примеру `.env.example`:

```dotenv
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=...
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=...
```

Это публичные идентификаторы OAuth-клиентов. Client secret в мобильное приложение добавлять нельзя.

Для iOS нужно также добавить config plugin с URL scheme, полученной из iOS Client ID:

```json
[
  "@react-native-google-signin/google-signin",
  {
    "iosUrlScheme": "com.googleusercontent.apps.<IOS_CLIENT_ID_PREFIX>"
  }
]
```

Нативный Google Sign In не работает внутри Expo Go. Для проверки нужен development build.

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
