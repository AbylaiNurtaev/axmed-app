export type AuthMode = "signUp" | "signIn";

export type Gender = "male" | "female";

export type AuthRoute =
  | { name: "welcome" }
  | { name: "auth"; mode: AuthMode }
  | { name: "verification"; mode: AuthMode; email: string }
  | { name: "about" }
  | { name: "ageRestriction" }
  | { name: "consents" }
  | { name: "bodyData" }
  | { name: "dataSource" }
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

