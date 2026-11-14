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

test("profile exposes a real logout route wired to the logout screen", () => {
  const profileSource = readFileSync(path.join(__dirname, "..", "src/features/profile/ProfileScreens.tsx"), "utf8");
  const settingsSource = readFileSync(path.join(__dirname, "..", "src/features/profile/ProfileSettingsScreens.tsx"), "utf8");
  const appSource = readFileSync(path.join(__dirname, "..", "App.tsx"), "utf8");
  assert.match(profileSource, /\| "logout"/);
  assert.match(profileSource, /menu\("logout",[\s\S]*?"Выйти"/);
  assert.match(profileSource, /onPress=\{\(\) => onOpen\("logout"\)\}/);
  assert.match(appSource, /profileDetail === "logout"[\s\S]*?<LogoutScreen/);
  assert.match(settingsSource, /export function LogoutScreen/);
  assert.match(settingsSource, /await onLogout\(\)/);
  assert.match(settingsSource, /<AxConfirmSheet[\s\S]*?confirmLabel="Выйти"/);
});

const cleanupModules = {
  "../plan/planReminders": { cancelAllPlanRemindersForUser: async () => {} },
  "../profile/profileNotifications": { clearProfileNotifications: async () => {} }
};

for (const offline of [false, true]) {
  test(`logout clears the native saved session${offline ? " even when the API is offline" : ""}`, async () => {
    let savedToken = null;
    const calls = [];
    const session = { accessToken: "test-access", refreshToken: "test-refresh", expiresIn: 60, user: { id: "test-user" } };
    const api = loadTypeScript("src/features/auth/authApi.ts", {
      "react-native": { Platform: { OS: "ios" } },
      ...cleanupModules,
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
    ...cleanupModules,
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
    ...cleanupModules,
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
