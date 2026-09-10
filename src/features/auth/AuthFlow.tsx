import { useState } from "react";
import { AuthChoiceScreen, VerificationScreen, WelcomeScreen } from "./entryScreens";
import { AboutScreen, AgeRestrictionScreen, ConsentsScreen } from "./profileScreens";
import { BodyDataScreen, ConnectionErrorScreen, DataSourceScreen, FirstResultScreen } from "./setupScreens";
import { signInWithSocialProvider } from "./socialAuth";
import type { SocialAuthCredential, SocialProvider } from "./socialAuth";
import { AuthMode, AuthRoute, BodyMeasurements } from "./types";

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
  onSocialAuthenticated?: (credential: SocialAuthCredential, mode: AuthMode) => Promise<void> | void;
};

export function AuthFlow({ onComplete, onSocialAuthenticated }: AuthFlowProps) {
  const [route, setRoute] = useState<AuthRoute>({ name: "welcome" });
  const [measurements, setMeasurements] = useState<BodyMeasurements>(initialMeasurements);

  const openAuth = (mode: AuthMode) => setRoute({ name: "auth", mode });
  const continueWithSocial = async (mode: AuthMode, provider: SocialProvider) => {
    const credential = await signInWithSocialProvider(provider);
    await onSocialAuthenticated?.(credential, mode);

    if (mode === "signUp") {
      setRoute({ name: "about" });
    } else {
      onComplete();
    }
  };

  if (route.name === "welcome") {
    return <WelcomeScreen onCreateAccount={() => openAuth("signUp")} onSignIn={() => openAuth("signIn")} />;
  }

  if (route.name === "auth") {
    return (
      <AuthChoiceScreen
        initialMode={route.mode}
        onBack={() => setRoute({ name: "welcome" })}
        onContinueEmail={(email, mode) => setRoute({ name: "verification", email, mode })}
        onSocialContinue={continueWithSocial}
      />
    );
  }

  if (route.name === "verification") {
    return (
      <VerificationScreen
        email={route.email}
        mode={route.mode}
        onBack={() => setRoute({ name: "auth", mode: route.mode })}
        onChangeEmail={() => setRoute({ name: "auth", mode: route.mode })}
        onConfirm={() => route.mode === "signUp" ? setRoute({ name: "about" }) : onComplete()}
      />
    );
  }

  if (route.name === "about") {
    return (
      <AboutScreen
        onBack={() => openAuth("signUp")}
        onContinue={() => setRoute({ name: "consents" })}
        onUnderAge={() => setRoute({ name: "ageRestriction" })}
      />
    );
  }

  if (route.name === "ageRestriction") {
    return (
      <AgeRestrictionScreen
        onFixDate={() => setRoute({ name: "about" })}
        onExit={() => setRoute({ name: "welcome" })}
      />
    );
  }

  if (route.name === "consents") {
    return (
      <ConsentsScreen
        onBack={() => setRoute({ name: "about" })}
        onContinue={() => setRoute({ name: "bodyData" })}
        onExit={() => setRoute({ name: "welcome" })}
      />
    );
  }

  if (route.name === "bodyData") {
    return (
      <BodyDataScreen
        values={measurements}
        onChange={setMeasurements}
        onBack={() => setRoute({ name: "consents" })}
        onContinue={() => setRoute({ name: "dataSource" })}
      />
    );
  }

  if (route.name === "dataSource") {
    return (
      <DataSourceScreen
        onBack={() => setRoute({ name: "bodyData" })}
        onConnect={(source) => source.id === "bia"
          ? setRoute({ name: "connectionError", source: source.title })
          : setRoute({ name: "firstResult" })}
        onManual={() => setRoute({ name: "firstResult" })}
        onContinue={() => setRoute({ name: "firstResult" })}
      />
    );
  }

  if (route.name === "connectionError") {
    return (
      <ConnectionErrorScreen
        source={route.source}
        onBack={() => setRoute({ name: "dataSource" })}
        onRetry={() => setRoute({ name: "dataSource" })}
        onManual={() => setRoute({ name: "firstResult" })}
      />
    );
  }

  return <FirstResultScreen measurements={measurements} onComplete={onComplete} />;
}
