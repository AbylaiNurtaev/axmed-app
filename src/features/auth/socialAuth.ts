import { Platform } from "react-native";

const defaultGoogleWebClientId = "1067093205466-sts78mosd7tm2cafg1vsn9lkk0trj6bi.apps.googleusercontent.com";
const defaultGoogleIosClientId = "1067093205466-lt209nb5s2p05dovapkp9u7ac6qspu6l.apps.googleusercontent.com";

export type SocialProvider = "Google" | "Apple";

export type SocialAuthCredential = {
  provider: "google" | "apple";
  idToken: string;
  authorizationCode: string | null;
  profile: {
    id: string;
    email: string | null;
    name: string | null;
    givenName: string | null;
    familyName: string | null;
    photo: string | null;
  };
};

export type SocialAuthErrorCode =
  | "cancelled"
  | "not_configured"
  | "unsupported"
  | "unavailable"
  | "in_progress"
  | "failed";

export class SocialAuthError extends Error {
  constructor(
    public readonly code: SocialAuthErrorCode,
    public readonly userMessage: string,
    options?: { cause?: unknown }
  ) {
    super(userMessage, options);
    this.name = "SocialAuthError";
  }
}

export async function signInWithSocialProvider(provider: SocialProvider): Promise<SocialAuthCredential> {
  return provider === "Apple" ? signInWithApple() : signInWithGoogle();
}

async function signInWithApple(): Promise<SocialAuthCredential> {
  if (Platform.OS !== "ios") {
    throw new SocialAuthError("unsupported", "Вход с Apple доступен на iPhone и iPad.");
  }

  try {
    const AppleAuthentication = await import("expo-apple-authentication");
    const isAvailable = await AppleAuthentication.isAvailableAsync();

    if (!isAvailable) {
      throw new SocialAuthError(
        "unavailable",
        "Вход с Apple недоступен на этом устройстве. Проверьте Apple ID и версию iOS."
      );
    }

    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL
      ]
    });

    if (!credential.identityToken) {
      throw new SocialAuthError("failed", "Apple не вернул токен входа. Попробуйте ещё раз.");
    }

    const name = [credential.fullName?.givenName, credential.fullName?.familyName]
      .filter(Boolean)
      .join(" ") || null;

    return {
      provider: "apple",
      idToken: credential.identityToken,
      authorizationCode: credential.authorizationCode,
      profile: {
        id: credential.user,
        email: credential.email,
        name,
        givenName: credential.fullName?.givenName ?? null,
        familyName: credential.fullName?.familyName ?? null,
        photo: null
      }
    };
  } catch (error) {
    if (error instanceof SocialAuthError) throw error;
    if (hasErrorCode(error) && error.code === "ERR_REQUEST_CANCELED") {
      throw new SocialAuthError("cancelled", "Вход с Apple отменён.", { cause: error });
    }
    throw new SocialAuthError("failed", "Не удалось войти с Apple. Попробуйте ещё раз.", { cause: error });
  }
}

async function signInWithGoogle(): Promise<SocialAuthCredential> {
  if (Platform.OS !== "android" && Platform.OS !== "ios") {
    throw new SocialAuthError("unsupported", "Вход с Google доступен в мобильном приложении.");
  }

  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? defaultGoogleWebClientId;
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? defaultGoogleIosClientId;

  if (!webClientId || (Platform.OS === "ios" && !iosClientId)) {
    throw new SocialAuthError(
      "not_configured",
      "Вход с Google ещё настраивается. Попробуйте позже."
    );
  }

  try {
    const GoogleSignIn = await import("@react-native-google-signin/google-signin");
    const configuration = Platform.OS === "ios"
      ? { webClientId, iosClientId }
      : { webClientId };

    GoogleSignIn.GoogleSignin.configure(configuration);
    await GoogleSignIn.GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

    const response = await GoogleSignIn.GoogleSignin.signIn();
    if (!GoogleSignIn.isSuccessResponse(response)) {
      throw new SocialAuthError("cancelled", "Вход с Google отменён.");
    }

    if (!response.data.idToken) {
      throw new SocialAuthError("failed", "Google не вернул токен входа. Попробуйте ещё раз.");
    }

    return {
      provider: "google",
      idToken: response.data.idToken,
      authorizationCode: response.data.serverAuthCode,
      profile: {
        id: response.data.user.id,
        email: response.data.user.email,
        name: response.data.user.name,
        givenName: response.data.user.givenName,
        familyName: response.data.user.familyName,
        photo: response.data.user.photo
      }
    };
  } catch (error) {
    if (error instanceof SocialAuthError) throw error;

    if (hasErrorCode(error)) {
      if (error.code === "SIGN_IN_CANCELLED") {
        throw new SocialAuthError("cancelled", "Вход с Google отменён.", { cause: error });
      }
      if (error.code === "IN_PROGRESS") {
        throw new SocialAuthError("in_progress", "Вход с Google уже открыт.", { cause: error });
      }
      if (error.code === "PLAY_SERVICES_NOT_AVAILABLE") {
        throw new SocialAuthError(
          "unavailable",
          "Для входа обновите сервисы Google Play на устройстве.",
          { cause: error }
        );
      }
    }

    throw new SocialAuthError(
      "failed",
      "Не удалось открыть вход с Google. Используйте development build приложения.",
      { cause: error }
    );
  }
}

function hasErrorCode(error: unknown): error is Error & { code: string } {
  return error instanceof Error && "code" in error && typeof error.code === "string";
}
