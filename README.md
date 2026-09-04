# AxMed Mobile

React Native / Expo prototype for the AxMed health application.

## Scripts

```bash
npm install
npm start
npm run ios
npm run android
npm run typecheck
```

The app currently uses local mock data and placeholder interactions so the UI can be tested before backend integration.

## Authentication and onboarding prototype

The app starts with the AxMed authentication and onboarding flow in `src/features/auth`.

- Email registration and sign-in use a local six-digit OTP interaction.
- Google and Apple actions are UI-only and continue through the corresponding mock flow.
- The BIA scale action opens the connection-error state so that it can be reviewed.
- Body fields contain design-sample values and can be edited.
- `AuthFlow` exposes a single `onComplete` callback. This is the integration point for the future session store and main application navigator.

No real account, health data, or device connection is created by the current prototype.
