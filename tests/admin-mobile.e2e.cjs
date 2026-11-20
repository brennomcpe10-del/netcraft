// Run against the local dev server + demo Firestore emulator only. No production URLs accepted.
const { chromium } = require("playwright");
const { initializeApp } = require("firebase/app");
const {
  getFirestore,
  connectFirestoreEmulator,
  doc,
  setDoc,
  getDoc,
  terminate,
} = require("firebase/firestore");
const assert = require("node:assert/strict");
const fs = require("node:fs");
(async () => {
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8085");
  assert.ok(process.env.TEST_ADMIN_PASSWORD);
  const db = getFirestore(
    initializeApp(
      { projectId: "demo-netcraft-admin-test", apiKey: "test", appId: "test" },
      "browser-fixtures",
    ),
  );
  connectFirestoreEmulator(db, "127.0.0.1", 8085);
  await setDoc(doc(db, "orders", "historical-browser"), {
    productId: "unrelated",
    status: "Pago",
    total: 20,
  });
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.TEST_CHROME_PATH || undefined,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const context = await browser.newContext({
    viewport: { width: 360, height: 800 },
  });
  // Deny accidental real Firebase calls during this test.
  await context.route(
    /https:\/\/(firestore|identitytoolkit)\.googleapis\.com\//,
    (route) => route.abort(),
  );
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const noOverflow = async (label) =>
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      label + " has horizontal overflow",
    );
  try {
    await page.goto("http://127.0.0.1:3000/admin");
    await page.getByLabel("Senha administrativa").fill("wrong-test-password");
    await page
      .getByRole("button", { name: "Acessar Painel", exact: true })
      .click();
    await page
      .getByRole("alert")
      .filter({ hasText: "Senha administrativa incorreta" })
      .waitFor();
    await page
      .getByLabel("Senha administrativa")
      .fill(process.env.TEST_ADMIN_PASSWORD);
    await page
      .getByRole("button", { name: "Acessar Painel", exact: true })
      .click();
    await page
      .getByText("Painel Administrativo NetCraftBR", { exact: true })
      .waitFor();
    await page.reload();
    await page
      .getByText("Painel Administrativo NetCraftBR", { exact: true })
      .waitFor();
    await page.getByRole("button", { name: "Categorias", exact: true }).click();
    await page
      .getByRole("button", { name: "Gerenciar produtos", exact: true })
      .first()
      .waitFor();
    for (const width of [320, 360, 430, 768, 1280]) {
      await page.setViewportSize({ width, height: 850 });
      await noOverflow("Categories " + width);
    }
    await page.setViewportSize({ width: 360, height: 800 });
    const farm = page
      .locator(".manager-grid article")
      .filter({
        has: page.getByRole("heading", { name: "KITS FARM", exact: true }),
      });
    await farm.getByRole("button", { name: "Gerenciar produtos" }).click();
    await page
      .getByRole("button", { name: "Novo produto", exact: true })
      .click();
    await page
      .getByLabel("Nome do produto", { exact: true })
      .fill("Farm de Creeper — teste local");
    await page.getByLabel("Preço (R$)", { exact: true }).fill("15.90");
    await page
      .getByLabel("Descrição", { exact: true })
      .fill("Cadastro exclusivo do emulador.");
    await page
      .getByLabel("Conteúdo do kit / benefícios (um por linha)", {
        exact: true,
      })
      .fill("2 itens de teste\nSem entrega real");
    await page
      .getByLabel("Ou enviar imagem", { exact: true })
      .setInputFiles("public/categories/items.webp");
    await page
      .getByRole("button", { name: "Salvar produto", exact: true })
      .waitFor();
    await page.getByLabel("Disponível para compra", { exact: true }).check();
    await page.getByLabel("Limite de unidades por carrinho").fill("3");
    for (const width of [320, 360, 430]) {
      await page.setViewportSize({ width, height: 800 });
      await noOverflow("Product editor " + width);
    }
    await page
      .getByRole("button", { name: "Salvar produto", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "Produto salvo" })
      .waitFor();
    const snapshot = await require("firebase/firestore").getDocs(
      require("firebase/firestore").collection(db, "products"),
    );
    const saved = snapshot.docs.find(
      (d) => d.data().name === "Farm de Creeper — teste local",
    );
    assert.ok(saved);
    assert.equal(saved.data().category, "farms");
    assert.equal(saved.data().price, 15.9);
    assert.match(saved.data().image, /^data:image\/jpeg/);
    await page.getByRole("button", { name: "Voltar", exact: true }).click();
    const nicknameClose = page.getByRole("button", {name:"Fechar", exact:true});
    if (await nicknameClose.isVisible()) await nicknameClose.click();
    await page
      .locator(".shop-category-grid")
      .getByRole("button")
      .filter({ hasText: "KITS FARM" })
      .click();
    await page
      .getByRole("heading", {
        name: "Farm de Creeper — teste local",
        exact: true,
      })
      .waitFor();
    await page
      .getByRole("button", { name: "Adicionar ao carrinho", exact: true })
      .click({ clickCount: 2 });
    await page
      .getByRole("button", { name: /Carrinho/ })
      .first()
      .click();
    await page.getByText(/31,80/).first().waitFor();
    await noOverflow("Cart");
    await page.goto("http://127.0.0.1:3000/admin");
    await page.getByRole("button", { name: "Loja", exact: true }).click();
    await page
      .getByRole("button", {
        name: "Desativar Farm de Creeper — teste local",
        exact: true,
      })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "Produto desativado" })
      .waitFor();
    assert.equal(
      (await getDoc(doc(db, "products", saved.id))).data().active,
      false,
    );
    await page
      .getByRole("button", {
        name: "Excluir Farm de Creeper — teste local",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "Cancelar exclusão", exact: true })
      .click();
    assert.equal((await getDoc(doc(db, "products", saved.id))).exists(), true);
    await page
      .getByRole("button", {
        name: "Excluir Farm de Creeper — teste local",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "Confirmar exclusão", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "Produto excluído" })
      .waitFor();
    assert.equal((await getDoc(doc(db, "products", saved.id))).exists(), false);
    assert.equal(
      (await getDoc(doc(db, "orders", "historical-browser"))).exists(),
      true,
    );
    await page.getByRole('button',{name:'Categorias',exact:true}).click();
    await page.getByRole('button',{name:'Criar categoria',exact:true}).click();
    await page.getByLabel('Título',{exact:true}).fill('Categoria de teste local');
    await page.getByLabel('Descrição',{exact:true}).fill('Somente no emulador');
    await page.getByLabel('Ou enviar imagem',{exact:true}).setInputFiles('public/categories/items.webp');
    await page.getByRole('button',{name:'Salvar categoria',exact:true}).click();
    const custom = page.locator('.manager-grid article').filter({has:page.getByRole('heading',{name:'Categoria de teste local',exact:true})});
    await custom.waitFor();
    const categories=(await getDoc(doc(db,'settings','storeCategories'))).data().categories;
    assert.ok(categories.some(c=>c.title==='Categoria de teste local' && c.image.startsWith('data:image/jpeg')));
    await custom.getByRole('button',{name:'Editar',exact:true}).click();
    await page.getByLabel('Ordem',{exact:true}).fill('12');
    await page.getByRole('button',{name:'Salvar categoria',exact:true}).click();
    await custom.getByRole('button',{name:/Excluir categoria/}).click();
    await page.getByRole('button',{name:'Cancelar exclusão',exact:true}).click();
    await custom.waitFor();
    await custom.getByRole('button',{name:/Excluir categoria/}).click();
    await page.getByRole('button',{name:'Confirmar exclusão da categoria',exact:true}).click();
    await custom.waitFor({state:'detached'});
    assert.ok(!(await getDoc(doc(db,'settings','storeCategories'))).data().categories.some(c=>c.title==='Categoria de teste local'));
    assert.deepEqual(errors, []);
    console.log(
      "PASS browser: login, restored session, category navigation, image upload, Firestore persistence, public listing, mixed navigation/cart total, deactivate/delete confirmation, historical order preserved; widths 320/360/430/768/1280",
    );
  } finally {
    await browser.close();
    await terminate(db);
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
