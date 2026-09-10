import { ReactNode, useRef, useState } from "react";
import { PanResponder, StyleSheet, View } from "react-native";
import { AuthChoiceScreen, VerificationScreen, WelcomeScreen } from "./entryScreens";
import { AboutScreen, AgeRestrictionScreen, ConsentsScreen } from "./profileScreens";
import { BodyDataScreen, ConnectionErrorScreen, DataSourceScreen, FirstResultScreen } from "./setupScreens";
import { signInWithSocialProvider } from "./socialAuth";
import type { SocialAuthCredential, SocialProvider } from "./socialAuth";
import { AuthMode, AuthRoute, BodyMeasurements } from "./types";
import type { VerificationResult } from "./authApi";

const initialMeasurements: BodyMeasurements = {
  height: "178",
  weight: "75.0",
  waist: "86.0",
  hips: "98.0",
  chest: "102.0",
  arm: "32.0",
  calf: "37.0"
};

type AuthFlowProps = {
  onComplete: () => void;
  onEmailRegister: (credentials: { email: string; password: string }) => Promise<VerificationResult>;
  onEmailSignIn: (credentials: { email: string; password: string }) => Promise<unknown>;
  onLogout: () => Promise<void>;
  onVerifyEmail: (input: { email: string; code: string }) => Promise<unknown>;
  onResendVerification: (email: string) => Promise<VerificationResult>;
  onSocialAuthenticated: (credential: SocialAuthCredential, mode: AuthMode) => Promise<unknown>;
};

export function AuthFlow({
  onComplete,
  onEmailRegister,
  onEmailSignIn,
  onLogout,
  onVerifyEmail,
  onResendVerification,
  onSocialAuthenticated
}: AuthFlowProps) {
  const [route, setRoute] = useState<AuthRoute>({ name: "welcome" });
  const [measurements, setMeasurements] = useState<BodyMeasurements>(initialMeasurements);
  const [sessionCreated, setSessionCreated] = useState(false);

  const openAuth = (mode: AuthMode) => setRoute({ name: "auth", mode });
  const previousRoute = getPreviousRoute(route);
  const goBack = () => {
    if (!previousRoute) return;
    if (route.name === "auth" && sessionCreated) {
      void onLogout().finally(() => {
        setSessionCreated(false);
        setRoute(previousRoute);
      });
      return;
    }
    setRoute(previousRoute);
  };
  const exitAccount = async () => {
    await onLogout();
    setSessionCreated(false);
    setRoute({ name: "welcome" });
  };
  const withSwipeBack = (screen: ReactNode) => (
    <SwipeBackGesture onBack={goBack}>{screen}</SwipeBackGesture>
  );
  const continueWithSocial = async (mode: AuthMode, provider: SocialProvider) => {
    const credential = await signInWithSocialProvider(provider);
    await onSocialAuthenticated?.(credential, mode);

    if (mode === "signUp") {
      setSessionCreated(true);
      setRoute({ name: "about" });
    } else {
      onComplete();
    }
  };
  const continueWithEmail = async (email: string, mode: AuthMode, password: string) => {
    if (mode === "signUp") {
      const result = await onEmailRegister({ email, password });
      setRoute({ name: "verification", email, mode, developmentCode: result.verificationCode });
      return;
    }

    await onEmailSignIn({ email, password });
    onComplete();
  };

  if (route.name === "welcome") {
    return <WelcomeScreen onCreateAccount={() => openAuth("signUp")} onSignIn={() => openAuth("signIn")} />;
  }

  if (route.name === "auth") {
    return withSwipeBack(
      <AuthChoiceScreen
        initialMode={route.mode}
        onBack={goBack}
        onContinueEmail={continueWithEmail}
        onSocialContinue={continueWithSocial}
      />
    );
  }

  if (route.name === "verification") {
    return withSwipeBack(
      <VerificationScreen
        email={route.email}
        mode={route.mode}
        developmentCode={route.developmentCode}
        onBack={goBack}
        onChangeEmail={() => setRoute({ name: "auth", mode: route.mode })}
        onConfirm={async (code) => {
          await onVerifyEmail({ email: route.email, code });
          setSessionCreated(true);
          setRoute({ name: "about" });
        }}
        onResend={() => onResendVerification(route.email)}
      />
    );
  }

  if (route.name === "about") {
    return withSwipeBack(
      <AboutScreen
        onBack={goBack}
        onContinue={() => setRoute({ name: "consents" })}
        onUnderAge={() => setRoute({ name: "ageRestriction" })}
      />
    );
  }

  if (route.name === "ageRestriction") {
    return withSwipeBack(
      <AgeRestrictionScreen
        onFixDate={() => setRoute({ name: "about" })}
        onExit={() => void exitAccount()}
      />
    );
  }

  if (route.name === "consents") {
    return withSwipeBack(
      <ConsentsScreen
        onBack={goBack}
        onContinue={() => setRoute({ name: "bodyData" })}
        onExit={() => void exitAccount()}
      />
    );
  }

  if (route.name === "bodyData") {
    return withSwipeBack(
      <BodyDataScreen
        values={measurements}
        onChange={setMeasurements}
        onBack={goBack}
        onContinue={() => setRoute({ name: "dataSource" })}
      />
    );
  }

  if (route.name === "dataSource") {
    return withSwipeBack(
      <DataSourceScreen
        onBack={goBack}
        onConnect={(source) => source.id === "bia"
          ? setRoute({ name: "connectionError", source: source.title })
          : setRoute({ name: "firstResult" })}
        onManual={() => setRoute({ name: "firstResult" })}
        onContinue={() => setRoute({ name: "firstResult" })}
      />
    );
  }

  if (route.name === "connectionError") {
    return withSwipeBack(
      <ConnectionErrorScreen
        source={route.source}
        onBack={goBack}
        onRetry={() => setRoute({ name: "dataSource" })}
        onManual={() => setRoute({ name: "firstResult" })}
      />
    );
  }

  return <FirstResultScreen measurements={measurements} onComplete={onComplete} />;
}

function SwipeBackGesture({ children, onBack }: { children: ReactNode; onBack: () => void }) {
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, gesture) => (
        gesture.x0 <= 32
        && gesture.dx > 12
        && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.35
      ),
      onPanResponderRelease: (_, gesture) => {
        const completedByDistance = gesture.dx >= 72 && Math.abs(gesture.dy) <= 90;
        const completedByVelocity = gesture.dx >= 36 && gesture.vx >= 0.55;
        if (completedByDistance || completedByVelocity) onBackRef.current();
      },
      onPanResponderTerminationRequest: () => false
    })
  ).current;

  return (
    <View style={styles.swipeBackArea} {...panResponder.panHandlers}>
      {children}
    </View>
  );
}

function getPreviousRoute(route: AuthRoute): AuthRoute | null {
  switch (route.name) {
    case "auth":
      return { name: "welcome" };
    case "verification":
      return { name: "auth", mode: route.mode };
    case "about":
      return { name: "auth", mode: "signUp" };
    case "ageRestriction":
    case "consents":
      return { name: "about" };
    case "bodyData":
      return { name: "consents" };
    case "dataSource":
      return { name: "bodyData" };
    case "connectionError":
      return { name: "dataSource" };
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  swipeBackArea: { flex: 1 }
});
