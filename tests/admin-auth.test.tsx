import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import { once } from "node:events";
import {
  adminAuthRouter,
  requireAdmin,
  generateAdminToken,
  isValidAdminToken,
} from "../server/auth/admin.ts";
import { api } from "../src/lib/api.ts";

test("real admin HTTP login: missing configuration, wrong password, signed session, tampering, rotation and protected writes", async () => {
  const previous = process.env.ADMIN_KEYWORD;
  const app = express();
  app.use(express.json());
  app.use("/api/admin", adminAuthRouter);
  app.post("/api/protected", requireAdmin, (_req, res) =>
    res.json({ success: true }),
  );
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as any).port;
  const request = (path: string, body?: unknown, token?: string) =>
    fetch(`http://127.0.0.1:${port}/api${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  try {
    delete process.env.ADMIN_KEYWORD;
    let response = await request("/admin/login", { password: "test" });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, "ADMIN_NOT_CONFIGURED");
    assert.equal(isValidAdminToken("anything"), false);
    // Setting after import reproduces dotenv initialization order.
    const password = crypto.randomBytes(24).toString("hex");
    process.env.ADMIN_KEYWORD = password;
    assert.equal(
      (await request("/admin/login", { password: "wrong" })).status,
      401,
    );
    assert.equal((await request("/admin/login", { password: {} })).status, 400);
    response = await request("/admin/login", { password });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const { token } = await response.json();
    assert.ok(token && !token.includes(password));
    assert.equal(isValidAdminToken(password), false);
    assert.equal(isValidAdminToken(token + "x"), false);
    assert.equal((await request("/protected", {}, password)).status, 403);
    assert.equal((await request("/protected", {})).status, 401);
    assert.equal((await request("/protected", {}, token)).status, 200);
    assert.equal(
      (await (await request("/admin/verify", undefined, token)).json())
        .authenticated,
      true,
    );
    const another = generateAdminToken();
    await request("/admin/logout", {}, token);
    assert.equal(isValidAdminToken(token), false);
    assert.equal(isValidAdminToken(another), true);
    process.env.ADMIN_KEYWORD = crypto.randomBytes(24).toString("hex");
    assert.equal(isValidAdminToken(another), false);
  } finally {
    if (previous === undefined) delete process.env.ADMIN_KEYWORD;
    else process.env.ADMIN_KEYWORD = previous;
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("frontend preserves backend errors and distinguishes HTML and network failure from a wrong password", async () => {
  const previous = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({ error: "Configure ADMIN_KEYWORD no Preview." }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      );
    await assert.rejects(api.loginAdmin("test"), /Configure ADMIN_KEYWORD/);
    globalThis.fetch = async () =>
      new Response("<html>deployment unavailable</html>", { status: 502 });
    await assert.rejects(api.loginAdmin("test"), /não respondeu em JSON/);
    globalThis.fetch = async () => {
      throw new TypeError("offline");
    };
    await assert.rejects(api.loginAdmin("test"), /conectar à API/);
    await assert.rejects(api.verifyAdmin("token"), /conectar à API/);
  } finally {
    globalThis.fetch = previous;
  }
});

test("mobile login dialog shows the real error, persists a successful session and verifies it on remount", async () => {
  const React = await import("react");
  const { Window } = await import("happy-dom");
  const { AdminProvider, useAdmin } = await import(
    "../src/context/AdminContext.tsx"
  );
  const { ToastProvider } = await import("../src/context/ToastContext.tsx");
  const { AdminLoginModal } = await import(
    "../src/components/modals/AdminLoginModal.tsx"
  );
  const browser = new Window({ url: "http://localhost/admin" });
  const globals = globalThis as any;
  const keys = [
    "window",
    "document",
    "HTMLElement",
    "sessionStorage",
    "IS_REACT_ACT_ENVIRONMENT",
    "fetch",
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, globals[key]]));
  Object.assign(globals, {
    window: browser,
    document: browser.document,
    HTMLElement: browser.HTMLElement,
    sessionStorage: browser.sessionStorage,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  let loginWorks = false,
    verifies = 0;
  globals.fetch = async (url: string) => {
    if (url.endsWith("/verify")) {
      verifies++;
      return new Response(JSON.stringify({ authenticated: true }));
    }
    return new Response(
      JSON.stringify(
        loginWorks
          ? { success: true, token: "test-signed-session" }
          : { error: "Configure ADMIN_KEYWORD no Preview." },
      ),
      { status: loginWorks ? 200 : 503 },
    );
  };
  function Status() {
    const admin = useAdmin();
    return (
      <>
        <output>
          {admin.isAdminLoggedIn
            ? "authenticated"
            : admin.isAdminChecking
              ? "checking"
              : "guest"}
        </output>
        <button onClick={admin.openAdminModal}>Abrir administração</button>
        <AdminLoginModal />
      </>
    );
  }
  const { createRoot } = await import("react-dom/client");
  const container = browser.document.createElement("div");
  browser.document.body.append(container);
  let root = createRoot(container as unknown as HTMLElement);
  const render = () =>
    React.act(async () =>
      root.render(
        <ToastProvider>
          <AdminProvider>
            <Status />
          </AdminProvider>
        </ToastProvider>,
      ),
    );
  try {
    await render();
    assert.equal(container.querySelector("output")?.textContent, "guest");
    await React.act(async () => container.querySelector("button")!.click());
    const input = container.querySelector("input")!;
    await React.act(async () => {
      Object.getOwnPropertyDescriptor(
        browser.HTMLInputElement.prototype,
        "value",
      )!.set!.call(input, "test-password");
      input.dispatchEvent(new browser.Event("input", { bubbles: true }));
    });
    await React.act(async () =>
      container
        .querySelector("form")!
        .dispatchEvent(
          new browser.Event("submit", { bubbles: true, cancelable: true }),
        ),
    );
    assert.match(
      container.querySelector('[role="alert"]')!.textContent,
      /Configure ADMIN_KEYWORD/,
    );
    assert.equal(container.querySelector("output")?.textContent, "guest");
    loginWorks = true;
    await React.act(async () =>
      container
        .querySelector("form")!
        .dispatchEvent(
          new browser.Event("submit", { bubbles: true, cancelable: true }),
        ),
    );
    assert.equal(
      container.querySelector("output")?.textContent,
      "authenticated",
    );
    assert.equal(
      browser.sessionStorage.getItem("netcraftbr_adm_session"),
      "test-signed-session",
    );
    await React.act(async () => root.unmount());
    root = createRoot(container as unknown as HTMLElement);
    await render();
    assert.equal(verifies, 1);
    assert.equal(
      container.querySelector("output")?.textContent,
      "authenticated",
    );
  } finally {
    await React.act(async () => root.unmount());
    Object.assign(globals, previous);
    browser.happyDOM.abort();
  }
});
