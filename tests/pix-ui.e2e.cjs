// Browser verifies only the UI with intercepted provider responses; financial service is tested separately.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.TEST_CHROME_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const context = await browser.newContext({
      viewport: { width: 360, height: 800 },
    }),
    page = await context.newPage();
  let order,
    key,
    creates = 0;
  await context.addInitScript(() =>
    localStorage.setItem(
      "netcraft-cart-v1",
      JSON.stringify([
        { productId: "pix-fixture", productType: "product", quantity: 2 },
        { productId: "pix-vip", productType: "vip", quantity: 1 },
      ]),
    ),
  );
  await context.route("**/api/pix/config", (r) =>
    r.fulfill({
      json: { available: true, environment: "test", realPayments: false },
    }),
  );
  await context.route("**/api/pix/orders", async (r) => {
    const input = r.request().postDataJSON();
    assert.equal(input.lines.length, 2);
    assert.equal(input.couponCode, "LOCALTEST");
    key = r.request().headers()["idempotency-key"];
    creates++;
    order = {
      id: crypto.createHash("sha256").update(key).digest("hex"),
      state: "pending",
      totalCents: 4498,
      discountCents: 500,
      qrCode: "local-fixture-only",
      qrBase64:
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
      expiresAt: new Date(Date.now() + 1800000).toISOString(),
      delivery: "Integração Minecraft desativada no ambiente de teste.",
    };
    return r.fulfill({ status: 201, json: order });
  });
  await context.route("**/api/pix/orders/*", (r) =>
    r.fulfill({
      status: order ? 200 : 404,
      json: order || { error: "Pedido ainda não existe." },
    }),
  );
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto("http://127.0.0.1:3000");
    await page
      .getByRole("button", { name: "Continuar como visitante", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Carrinho: 3 produtos", exact: true })
      .click();
    await page.getByLabel("Gamertag Bedrock").fill("Local Tester");
    await page.getByLabel("E-mail de teste").fill("local@testuser.com");
    await page.getByLabel("CPF do comprador de teste").fill("12345678909");
    await page.getByLabel("Cupom (opcional)").fill("LOCALTEST");
    await page
      .getByRole("button", { name: "Gerar Pix de teste", exact: true })
      .click();
    await page.getByText("Aguardando pagamento", { exact: true }).waitFor();
    await page.getByRole("img", { name: "QR Code Pix de teste" }).waitFor();
    assert.equal(creates, 1);
    for (const width of [320, 360, 430]) {
      await page.setViewportSize({ width, height: 800 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
    }
    await page.reload();
    await page
      .getByRole("button", { name: "Continuar como visitante", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Carrinho: 3 produtos", exact: true })
      .click();
    await page.getByText("Aguardando pagamento", { exact: true }).waitFor();
    order.state = "approved";
    await page
      .getByRole("button", { name: "Atualizar status", exact: true })
      .click();
    await page
      .getByText("Pagamento aprovado — teste", { exact: true })
      .waitFor();
    assert.equal(
      await page.getByRole("img", { name: "QR Code Pix de teste" }).count(),
      0,
    );
    assert.deepEqual(errors, []);
    const blocked = await context.request.post(
      "http://127.0.0.1:3000/api/orders/anything/simulate-payment",
    );
    assert.equal(blocked.status(), 410);
    const webhook = await context.request.post(
      "http://127.0.0.1:3000/api/pix/webhook",
    );
    assert.equal(webhook.status(), 401);
    console.log(
      "PASS mobile checkout UI 320/360/430, QR, pending/approved, resume after refresh, public simulation disabled and unsigned webhook rejected",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
