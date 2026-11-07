// Isolated local demo Firestore only; verifies the actual mobile form and fresh public header.
const { chromium } = require("playwright");
const { initializeApp } = require("firebase/app");
const {
  getFirestore,
  connectFirestoreEmulator,
  doc,
  getDoc,
  setDoc,
  terminate,
} = require("firebase/firestore");
const assert = require("node:assert/strict");
(async () => {
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8085");
  assert.ok(process.env.TEST_ADMIN_PASSWORD);
  const db = getFirestore(
    initializeApp(
      { projectId: "demo-netcraft-admin-test", appId: "test", apiKey: "test" },
      "logo-check",
    ),
  );
  connectFirestoreEmulator(db, "127.0.0.1", 8085);
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.TEST_CHROME_PATH,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const context = await browser.newContext({
    viewport: { width: 360, height: 800 },
  });
  await context.route(
    /https:\/\/(firestore|identitytoolkit)\.googleapis\.com\//,
    (r) => r.abort(),
  );
  const page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto("http://127.0.0.1:3000/admin");
    await page
      .getByLabel("Senha administrativa")
      .fill(process.env.TEST_ADMIN_PASSWORD);
    await page
      .getByRole("button", { name: "Acessar Painel", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Identidade Visual", exact: true })
      .click();
    for (const format of ["png", "jpg", "webp"]) {
      const upload = page.waitForResponse(
        (r) =>
          r.url().endsWith("/api/admin/identity/upload") &&
          r.request().method() === "POST",
      );
      await page
        .getByLabel("Enviar ou substituir logo", { exact: true })
        .setInputFiles(process.env.TEST_LOGO_FIXTURES + "/logo." + format);
      const uploaded = await upload;
      assert.equal(uploaded.status(), 200, await uploaded.text());
      const { asset, uploadToken } = await uploaded.json();
      assert.equal(asset.storage, "firestore");
      assert.ok(asset.url.startsWith("data:image/"));
      assert.ok(uploadToken.length < 350000);
      await page.locator(".identity-preview img").waitFor();
      assert.ok(
        await page
          .locator(".identity-preview img")
          .evaluate((img) => img.complete && img.naturalWidth > 0),
      );
      await page
        .getByRole("button", { name: "Salvar identidade visual", exact: true })
        .click();
      await page
        .getByRole("status")
        .filter({ hasText: "Identidade visual salva" })
        .waitFor();
      const stored = await getDoc(doc(db, "settings", "siteIdentity"));
      assert.equal(stored.data().version, 2);
      assert.ok(stored.data().signature);
      const publicIdentity = await (
        await page.request.get("http://127.0.0.1:3000/api/identity")
      ).json();
      assert.equal(publicIdentity.asset.url, asset.url);
    }
    for (const width of [320, 360, 430]) {
      await page.setViewportSize({ width, height: 800 });
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
    }
    const saved = await (
      await page.request.get("http://127.0.0.1:3000/api/identity")
    ).json();
    await page.goto("http://127.0.0.1:3000/");
    await page.locator(".nc-header .brand-media img").waitFor();
    await page.reload();
    await page.locator(".nc-header .brand-media img").waitFor();
    assert.equal(
      await page.locator(".nc-header .brand-media img").getAttribute("src"),
      saved.asset.url,
    );
    assert.ok(
      await page
        .locator(".nc-header .brand-media img")
        .evaluate((img) => img.complete && img.naturalWidth > 0),
    );
    const fresh = await browser.newContext({
      viewport: { width: 320, height: 800 },
    });
    const freshPage = await fresh.newPage();
    await freshPage.goto("http://127.0.0.1:3000/");
    await freshPage.locator(".nc-header .brand-media img").waitFor();
    assert.equal(
      await freshPage
        .locator(".nc-header .brand-media img")
        .getAttribute("src"),
      saved.asset.url,
    );
    await fresh.close();
    assert.equal(
      (
        await page.request.put("http://127.0.0.1:3000/api/admin/identity", {
          data: { reset: true, fit: "contain", x: 50, y: 50 },
        })
      ).status(),
      401,
    );
    const login = await page.request.post(
        "http://127.0.0.1:3000/api/admin/login",
        { data: { password: process.env.TEST_ADMIN_PASSWORD } },
      ),
      { token } = await login.json();
    const previous = (await getDoc(doc(db, "settings", "siteIdentity"))).data();
    await setDoc(doc(db, "settings", "siteIdentity"), {
      ...previous,
      payload: previous.payload.replace("inline:", "forged:"),
    });
    assert.equal(
      (await page.request.get("http://127.0.0.1:3000/api/identity")).status(),
      503,
    );
    await setDoc(doc(db, "settings", "siteIdentity"), previous);
    // The browser's arbitrary asset field must not override the server's stored logo.
    const forged = await page.request.put(
      "http://127.0.0.1:3000/api/admin/identity",
      {
        headers: { Authorization: "Bearer " + token },
        data: {
          asset: { url: "https://attacker.test" },
          fit: "contain",
          x: 25,
          y: 75,
        },
      },
    );
    assert.equal(forged.status(), 200);
    assert.equal((await forged.json()).asset.url, saved.asset.url);
    await page.goto("http://127.0.0.1:3000/admin");
    await page
      .getByRole("button", { name: "Identidade Visual", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: "Remover arquivo / restaurar padrão",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "Salvar identidade visual", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "Identidade visual salva" })
      .waitFor();
    await page.reload();
    assert.equal(
      (
        await (
          await page.request.get("http://127.0.0.1:3000/api/identity")
        ).json()
      ).asset,
      null,
    );
    const fs = require("node:fs"),
      gif = fs.readFileSync(process.env.TEST_LOGO_FIXTURES + "/logo.gif");
    const unavailable = await page.request.post(
      "http://127.0.0.1:3000/api/admin/identity/upload",
      {
        headers: { Authorization: "Bearer " + token },
        data: { mime: "image/gif", data: gif.toString("base64") },
      },
    );
    assert.equal(unavailable.status(), 503);
    assert.match(
      (await unavailable.json()).error,
      /PNG, JPG|imagens estáticas/,
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS: PNG/JPG/WebP compressed, saved to Firestore, visible after reload and in a fresh browser; default restored; auth/tamper/forged URL blocked; GIF unavailable message; mobile 320/360/430. Admin credentials intentionally invalid.",
    );
  } finally {
    await browser.close();
    await terminate(db);
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
