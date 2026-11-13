const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

function loadTypeScript(relativePath, modules, globals = {}, testExports = "") {
  const filename = path.join(__dirname, "..", relativePath);
  const source = readFileSync(filename, "utf8") + testExports;
  const { outputText } = ts.transpileModule(source, {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true
    }
  });
  const exports = {};
  // No browser globals: window.open must not hide an unbound native callback.
  vm.runInNewContext(outputText, {
    exports,
    require(id) {
      assert.ok(Object.hasOwn(modules, id), `Unexpected import: ${id}`);
      return modules[id];
    },
    ...globals
  }, { filename });
  return exports;
}

function profileScreens() {
  const native = Object.fromEntries([
    "ActivityIndicator", "Alert", "Image", "Modal", "Pressable", "SafeAreaView", "ScrollView", "View"
  ].map(name => [name, name]));
  native.Text = function Text() {};
  native.Platform = { OS: "ios" };
  native.StyleSheet = { create: styles => styles };
  return loadTypeScript("App.tsx", {
    "react": require("react"),
    "react/jsx-runtime": require("react/jsx-runtime"),
    "react-native": native,
    "react-native-svg": {},
    "expo-status-bar": {},
    "@expo/vector-icons": {},
    "./src/features/auth/AuthFlow": {},
    "./src/features/auth/SessionRestoreScreen": {},
    "./src/features/home/HomeScreen": { homeColors: {} },
    "./src/features/auth/authApi": {},
    "./src/features/devices/DeviceSyncCard": {},
    "./src/features/devices/ConnectedDevicesScreen": {},
    "./assets/body-front.png": 1,
    "./assets/comparison.png": 4
  }, {}, "\nexport { ProfileScreen, ProfileDetailScreen };\n");
}

function nodes(node) {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object") return [];
  return [node, ...nodes(node.props?.children)];
}

function text(node) {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(text).join("");
  return node?.props ? text(node.props.children) : "";
}

test("native profile renders without a global open and forwards its callback", () => {
  const { ProfileScreen } = profileScreens();
  const open = () => {};
  const tree = ProfileScreen({ open, openDetail: () => {} });
  const groups = nodes(tree).filter(node => node.type?.name === "SettingsGroup");
  assert.equal(groups.length, 3);
  assert.equal(groups[0].props.open, open);
  assert.equal(groups[1].props.open, open);
});

test("profile exit opens the logout screen and its action invokes onLogout", () => {
  const { ProfileScreen, ProfileDetailScreen } = profileScreens();
  let detail;
  let logoutCalls = 0;
  const open = () => assert.fail("Logout must not open a placeholder sheet");
  const profile = ProfileScreen({ open, openDetail: value => { detail = value; } });
  const exit = nodes(profile).find(node => node.type === "Pressable" && text(node) === "Выйти из аккаунта");
  assert.ok(exit);
  exit.props.onPress();
  assert.equal(detail, "logout");
  const screen = ProfileDetailScreen({
    type: detail, back: () => {}, open,
    onLogout: async () => { logoutCalls += 1; }
  });
  const confirm = nodes(screen).find(node => node.type === "Pressable" && text(node).includes("Выйти на этом устройстве"));
  assert.ok(confirm);
  confirm.props.onPress();
  assert.equal(logoutCalls, 1);
});

for (const offline of [false, true]) {
  test(`logout clears the native saved session${offline ? " even when the API is offline" : ""}`, async () => {
    let savedToken = null;
    const calls = [];
    const session = { accessToken: "test-access", refreshToken: "test-refresh", expiresIn: 60, user: { id: "test-user" } };
    const api = loadTypeScript("src/features/auth/authApi.ts", {
      "react-native": { Platform: { OS: "ios" } },
      "expo-secure-store": {
        getItemAsync: async () => savedToken,
        setItemAsync: async (_, value) => { savedToken = value; },
        deleteItemAsync: async () => { savedToken = null; }
      }
    }, {
      process: { env: { EXPO_PUBLIC_API_URL: "https://test.invalid" } },
      AbortController, setTimeout, clearTimeout,
      fetch: async url => {
        calls.push(url);
        if (url.endsWith("/login")) return { ok: true, status: 200, json: async () => session };
        assert.ok(url.endsWith("/logout"));
        assert.equal(savedToken, null);
        assert.equal(api.getAccessToken(), null);
        if (offline) throw new Error("Test network failure");
        return { ok: true, status: 204 };
      }
    });
    await api.loginWithEmail("test@example.invalid", "test-password");
    assert.equal(savedToken, session.refreshToken);
    assert.equal(api.getAccessToken(), session.accessToken);
    await api.logout();
    assert.equal(savedToken, null);
    assert.equal(api.getAccessToken(), null);
    assert.equal(await api.restoreSession(), null);
    assert.equal(calls.length, 2, "No automatic refresh request after logout");
  });
}

test("a late refresh cannot resurrect credentials after logout", async () => {
  let stored;
  let resolveRefresh;
  let refreshStarted;
  const started = new Promise(resolve => { refreshStarted = resolve; });
  const delayed = new Promise(resolve => { resolveRefresh = resolve; });
  const session = { accessToken: "test-old-access", refreshToken: "test-old-refresh", user: { id: "user-a" } };
  const api = loadTypeScript("src/features/auth/authApi.ts", {
    "react-native": { Platform: { OS: "ios" } },
    "expo-secure-store": {
      getItemAsync: async () => stored,
      setItemAsync: async (_, value) => { stored = value; },
      deleteItemAsync: async () => { stored = null; }
    }
  }, {
    process: { env: { EXPO_PUBLIC_API_URL: "https://test.invalid" } },
    AbortController, setTimeout, clearTimeout,
    fetch: async url => {
      if (url.endsWith("/login")) return { ok: true, status: 200, json: async () => session };
      if (url.endsWith("/refresh")) { refreshStarted(); return delayed; }
      assert.ok(url.endsWith("/logout"));
      return { ok: true, status: 204 };
    }
  });
  await api.loginWithEmail("test@example.invalid", "test-password");
  const restoring = api.restoreSession();
  await started;
  await api.logout();
  resolveRefresh({ ok: true, status: 200, json: async () => ({ ...session, accessToken: "test-new-access", refreshToken: "test-new-refresh" }) });
  assert.equal(await restoring, null);
  assert.equal(stored, null);
  assert.equal(api.getSessionUserId(), null);
  assert.equal(api.getAccessToken(), null);
});

test("logout waits for an already-started secure-store write before deleting", async () => {
  let stored;
  let releaseWrite;
  let writeStarted;
  const started = new Promise(resolve => { writeStarted = resolve; });
  const gate = new Promise(resolve => { releaseWrite = resolve; });
  let holdWrite = false;
  const session = { accessToken: "test-access", refreshToken: "test-refresh", user: { id: "user-a" } };
  const api = loadTypeScript("src/features/auth/authApi.ts", {
    "react-native": { Platform: { OS: "ios" } },
    "expo-secure-store": {
      getItemAsync: async () => stored,
      setItemAsync: async (_, value) => { if (holdWrite) { writeStarted(); await gate; } stored = value; },
      deleteItemAsync: async () => { stored = null; }
    }
  }, {
    process: { env: { EXPO_PUBLIC_API_URL: "https://test.invalid" } },
    AbortController, setTimeout, clearTimeout,
    fetch: async url => url.endsWith("/logout") ? { ok: true, status: 204 } : { ok: true, status: 200, json: async () => session }
  });
  await api.loginWithEmail("test@example.invalid", "test-password");
  holdWrite = true;
  const restoring = api.restoreSession();
  await started;
  const exiting = api.logout();
  releaseWrite();
  await exiting;
  assert.equal(await restoring, null);
  assert.equal(stored, null);
  assert.equal(api.getAccessToken(), null);
});

function sessionFixture(initialToken = "saved-refresh") {
  let stored = initialToken;
  let respond = () => assert.fail("Unexpected API request");
  const requests = [];
  const api = loadTypeScript("src/features/auth/authApi.ts", {
    "react-native": { Platform: { OS: "ios" } },
    "expo-secure-store": {
      getItemAsync: async () => stored,
      setItemAsync: async (_, value) => { stored = value; },
      deleteItemAsync: async () => { stored = null; }
    }
  }, {
    process: { env: { EXPO_PUBLIC_API_URL: "https://test.invalid" } },
    AbortController, setTimeout, clearTimeout,
    Error,
    fetch: async (url, options) => {
      requests.push({ url, body: options.body && JSON.parse(options.body) });
      return respond(url, options);
    }
  });
  return { api, requests, token: () => stored, respond: callback => { respond = callback; } };
}

const restoredSession = {
  user: { id: "test-user", email: "test@example.invalid", displayName: null, emailVerified: true },
  accessToken: "fresh-access", refreshToken: "fresh-refresh", expiresIn: 900
};
const apiResponse = (status, payload) => ({
  ok: status >= 200 && status < 300, status, json: async () => payload,
  headers: { get: () => null }
});

test("an absent session opens sign-in without contacting the server", async () => {
  const f = sessionFixture(null);
  assert.equal(await f.api.restoreSession(), null);
  assert.equal(f.requests.length, 0);
});

test("successful startup refresh restores the user and saves the rotated token", async () => {
  const f = sessionFixture();
  f.respond(() => apiResponse(200, restoredSession));
  assert.equal(await f.api.restoreSession(), restoredSession);
  assert.equal(f.api.getSessionUserId(), restoredSession.user.id);
  assert.equal(f.token(), restoredSession.refreshToken);
  assert.deepEqual(f.requests[0].body, { refreshToken: "saved-refresh" });
});

test("a rejected session is cleared and can no longer refresh automatically", async () => {
  const f = sessionFixture();
  f.respond(() => apiResponse(401, { error: { code: "authRequired" } }));
  assert.equal(await f.api.restoreSession(), null);
  assert.equal(f.token(), null);
  assert.equal(f.api.getSessionUserId(), null);
  assert.equal(await f.api.restoreSession(), null);
  assert.equal(f.requests.length, 1);
});

for (const failure of ["offline", "timeout", "server"]) {
  test(`${failure} during startup preserves the saved session for a successful retry`, async () => {
    const f = sessionFixture();
    let notifications = 0;
    f.api.subscribeSession(() => notifications++);
    f.respond(() => {
      if (failure === "server") return apiResponse(503, { error: { code: "unavailable" } });
      throw Object.assign(new Error("Test request failure"), { name: failure === "timeout" ? "AbortError" : "TypeError" });
    });
    await assert.rejects(f.api.restoreSession(), error => error instanceof f.api.AuthApiError
      && error.code === (failure === "server" ? "unavailable" : failure === "timeout" ? "TIMEOUT" : "NETWORK_ERROR"));
    assert.equal(f.token(), "saved-refresh");
    assert.equal(f.api.getSessionUserId(), null);
    assert.equal(notifications, 0, "A temporary failure must not announce a logout");
    f.respond(() => apiResponse(200, restoredSession));
    assert.equal(await f.api.restoreSession(), restoredSession);
    assert.equal(f.api.getSessionUserId(), restoredSession.user.id);
    assert.equal(f.token(), restoredSession.refreshToken);
    assert.deepEqual(f.requests[1].body, { refreshToken: "saved-refresh" });
  });
}

test("a temporary refresh failure inside the app does not log out the current user", async () => {
  const f = sessionFixture();
  f.respond(() => apiResponse(200, restoredSession));
  await f.api.restoreSession();
  let notifications = 0;
  f.api.subscribeSession(() => notifications++);
  f.respond(url => url.endsWith("/refresh")
    ? apiResponse(503, { error: { code: "unavailable" } })
    : apiResponse(401, { error: { code: "authRequired" } }));
  await assert.rejects(f.api.authenticatedRequest("/api/devices"), error => error.status === 503);
  assert.equal(f.api.getSessionUserId(), restoredSession.user.id);
  assert.equal(f.token(), restoredSession.refreshToken);
  assert.equal(notifications, 0);
});
