export type AuthMode = "signUp" | "signIn";

export type Gender = "male" | "female";

export type RegistrationBasics = {
  firstName: string;
  birthDate: string;
  gender: Gender;
};

export type AuthRoute =
  | { name: "welcome" }
  | { name: "auth"; mode: AuthMode; email?: string; notice?: string }
  | { name: "passwordRecovery"; email: string }
  | { name: "verification"; mode: AuthMode; email: string; developmentCode?: string }
  | { name: "about" }
  | { name: "ageRestriction" }
  | { name: "consents" }
  | { name: "bodyData" }
  | { name: "dataSource"; kind?: "fitness-band" | "scale" }
  | { name: "connectionError"; source: string }
  | { name: "firstResult" };

export type BodyMeasurements = {
  height: string;
  weight: string;
  waist: string;
  hips: string;
  chest: string;
  arm: string;
  calf: string;
};
