const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

function load(relativePath, modules, globals = {}) {
  const filename = path.join(__dirname, "..", relativePath);
  const { outputText } = ts.transpileModule(readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
  });
  const exports = {};
  vm.runInNewContext(outputText, {
    exports,
    require(id) { assert.ok(Object.hasOwn(modules, id), `Unexpected import: ${id}`); return modules[id]; },
    ...globals
  }, { filename });
  return exports;
}

function findSocialButton(node, provider) {
  if (!node || typeof node !== "object") return;
  if (node.props?.provider === provider) return node;
  for (const child of [node.props?.children].flat(Infinity)) {
    const found = findSocialButton(child, provider);
    if (found) return found;
  }
}

async function pressSocial({ provider, platform = "ios", code = "ACCOUNT_NOT_FOUND", cancelled = false, mode = "signIn", confirm = true }) {
  const alerts = [], states = [], requests = [], modeChanges = [];
  const api = load("src/features/auth/authApi.ts", {
    "react-native": { Platform: { OS: platform } },
    "expo-secure-store": {},
    "../plan/planReminders": { cancelAllPlanRemindersForUser: async () => {} },
    "../profile/profileNotifications": { clearProfileNotifications: async () => {} }
  }, {
    process: { env: { EXPO_PUBLIC_API_URL: "https://test.invalid" } },
    AbortController, setTimeout, clearTimeout,
    fetch: async (url, options) => {
      requests.push({ url, body: JSON.parse(options.body) });
      return Response.json({ error: { code, message: "Server error" } }, { status: code === "ACCOUNT_NOT_FOUND" ? 404 : code === "ACCOUNT_EXISTS" ? 409 : 401 });
    }
  });
  const { SocialAuthError } = load("src/features/auth/socialAuth.ts", { "react-native": { Platform: { OS: platform } } });
  const jsx = (type, props) => ({ type, props });
  const { AuthChoiceScreen } = load("src/features/auth/AuthChoiceScreen.tsx", {
    "react/jsx-runtime": { jsx, jsxs: jsx },
    react: { useEffect() {}, useRef: value => ({ current: value }), useState: initial => [initial, value => states.push(value)] },
    "./authTheme": { useAuthStyles: () => ({ styles: {}, colors: {}, dark: false }) },
    "@expo/vector-icons": { Ionicons: "Icon" },
    "expo-apple-authentication": {},
    "expo-status-bar": { StatusBar: "StatusBar" },
    "react-native": {
      Platform: { OS: platform }, Alert: { alert: (...args) => alerts.push(args) },
      useWindowDimensions: () => ({ width: 390, height: 844 }),
      SafeAreaView: "SafeAreaView", KeyboardAvoidingView: "KeyboardAvoidingView", ScrollView: "ScrollView", View: "View", Text: "Text", Pressable: "Pressable"
    },
    "react-native-svg": {},
    "./authApi": api,
    "./socialAuth": { SocialAuthError },
    "./useSecondsRemaining": { useSecondsRemaining: () => 0 }
  }, { alert: message => alerts.push([message]), confirm: message => { alerts.push([message]); return confirm; } });
  const tree = AuthChoiceScreen({
    mode, onModeChange: mode => modeChanges.push(mode), onBack() {}, onForgotPassword() {}, onContinueEmail() {},
    onSocialContinue: (mode, selected) => {
      if (cancelled) throw new SocialAuthError("cancelled", "Cancelled");
      return api.authenticateWithSocial({ provider: selected.toLowerCase(), idToken: "test-token", authorizationCode: null, profile: {} }, mode);
    }
  });
  await findSocialButton(tree, provider).props.onPress();
  assert.equal(states.at(-1), null, "The social sign-in button becomes available again");
  assert.equal(api.getSessionUserId(), null, "A failed sign-in must not create a session");
  return { alerts, states, requests, modeChanges };
}

for (const provider of ["Google", "Apple"]) {
  for (const platform of ["ios", "web"]) {
    test(`${provider}: missing AxMed account opens an alert on ${platform}`, async () => {
      const { alerts, states, requests } = await pressSocial({ provider, platform });
      assert.equal(alerts.length, 1);
      const message = alerts[0].join(" ");
      assert.match(message, /Аккаунт не найден/);
      assert.match(message, /Сначала зарегистрируйтесь/);
      assert.ok(message.includes(provider));
      assert.equal(states.some(value => typeof value === "string" && value.includes("Не удалось войти")), false);
      assert.equal(requests.length, 1);
      assert.equal(requests[0].body.mode, "signIn");
      assert.equal(requests[0].body.provider, provider.toLowerCase());
    });
  }
}

test("An invalid provider token keeps the ordinary sign-in error", async () => {
  const { alerts, states } = await pressSocial({ provider: "Google", code: "INVALID_SOCIAL_TOKEN" });
  assert.equal(alerts.length, 0);
  assert.ok(states.includes("Не удалось войти с Google. Попробуйте ещё раз."));
});

test("Cancelling provider sign-in does not show an account-not-found alert", async () => {
  const { alerts, requests, states } = await pressSocial({ provider: "Apple", cancelled: true });
  assert.equal(alerts.length, 0);
  assert.equal(requests.length, 0);
  assert.equal(states.some(value => typeof value === "string" && value.includes("Не удалось войти")), false);
});

for (const provider of ["Google", "Apple"]) {
  test(`${provider}: an existing account offers sign-in without creating a session or navigating before confirmation`, async () => {
    const { alerts, requests, modeChanges } = await pressSocial({ provider, mode: "signUp", code: "ACCOUNT_EXISTS" });
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0][0], "Аккаунт уже существует");
    assert.equal(requests[0].body.mode, "signUp");
    assert.deepEqual(modeChanges, []);
    const buttons = alerts[0][2];
    assert.equal(buttons.find(button => button.text === "Отмена").style, "cancel");
    buttons.find(button => button.text === "Войти").onPress();
    assert.deepEqual(modeChanges, ["signIn"]);
  });
  for (const confirm of [true, false]) {
    test(`${provider}: the web alert ${confirm ? "opens sign-in on confirmation" : "stays on registration when cancelled"}`, async () => {
      const { alerts, modeChanges } = await pressSocial({ provider, platform: "web", mode: "signUp", code: "ACCOUNT_EXISTS", confirm });
      assert.match(alerts[0][0], /Аккаунт уже существует/);
      assert.deepEqual(modeChanges, confirm ? ["signIn"] : []);
    });
  }
}
