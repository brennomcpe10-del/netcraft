// Local compiled storefront only; intercept ALL /api calls. No production
// URLs, payment credentials, Firestore or live transactions are touched.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
(async()=>{
  assert.equal(process.env.NC_STORE_BROWSER_TEST,"1");
  assert.ok(!process.env.VERCEL_ENV && !process.env.MERCADOPAGO_ACCESS_TOKEN);
  const browser=await chromium.launch({
    executablePath:process.env.TEST_CHROME_PATH||undefined,
    headless:true,args:["--no-sandbox","--disable-dev-shm-usage"],
  });
  const errors=[];
  const fixtureProduct={id:"pix-fixture",name:"Kit PVP laboratório",
    category:"kits",price:19.99,description:"Apenas teste",
    image:"/categories/items.webp",active:true,
    order:1,highlights:["3 diamantes"],allowQuantity:true,maxQuantity:5};
  const fixtureVip={id:"pix-vip",name:"Explorer laboratório",price:10,
    duration:"30 dias",description:"Apenas teste",
    image:"crown",active:true,order:1,color:"emerald",benefits:["Prefixo"]};
  const context=await browser.newContext({viewport:{width:320,height:820}});
  await context.route(/https:\/\//,route=>route.abort());
  await context.route("**/api/**",async route=>{
    const request=route.request(),p=new URL(request.url()).pathname;
    let body={},status=200;
    if(p==="/api/storefront/catalog")body={products:[fixtureProduct],vips:[fixtureVip],categories:null,environment:"test"};
    else if(p==="/api/settings")body={};
    else if(["/api/events","/api/news","/api/community"].includes(p))body=[];
    else if(p==="/api/pix/config")body={available:true,environment:"test"};
    else if(p==="/api/cart/quote"){
      const input=request.postDataJSON();
      const lines=input.lines||[];
      const subtotal=lines.reduce((total,line)=>total+
        (line.productType==="vip"?1000:1999)*line.quantity,0);
      const discount=input.couponCode==="LOCALTEST"?Math.round(subtotal/10):0;
      if(!lines.length||input.couponCode && input.couponCode!=="LOCALTEST"){
        status=400;body={error:"Cupom não encontrado."};
      }else{
        body={lines:lines.map(line=>({...line,unitCents:line.productType==="vip"?1000:1999,
          lineCents:(line.productType==="vip"?1000:1999)*line.quantity,
          name:line.productType==="vip"?fixtureVip.name:fixtureProduct.name})),
          subtotalCents:subtotal,discountCents:discount,totalCents:subtotal-discount,
          currency:"BRL",couponsAvailable:true,combinedPaymentAvailable:true,
          couponCode:input.couponCode||null};
      }
    }else if(p==="/api/pix/orders"&&request.method()==="POST"){
      const input=request.postDataJSON();
      assert.equal(input.couponCode,"LOCALTEST");
      assert.deepEqual(input.lines.map(line=>line.productId),["pix-fixture","pix-vip"]);
      body={id:"a".repeat(64),state:"pending",totalCents:4498,
        discountCents:500,qrCode:"test-only-qr-no-bank",
        qrBase64:"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
        expiresAt:new Date(Date.now()+600000).toISOString(),
        delivery:"Nenhuma entrega real."};
    }else if(p.startsWith("/api/pix/orders/")){
      body={id:"a".repeat(64),state:"pending",totalCents:4498,
        discountCents:500,qrCode:"test-only-qr-no-bank",
        qrBase64:"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
        expiresAt:new Date(Date.now()+600000).toISOString(),
        delivery:"Nenhuma entrega real."};
    }else{status=404;body={error:"Mock-only API"};}
    await route.fulfill({status,contentType:"application/json",
      body:JSON.stringify(body)});
  });
  const page=await context.newPage();
  page.on("pageerror",e=>errors.push(e.message));
  async function noOverflow(label){
    for(const width of [320,360,430,768,1280]){
      await page.setViewportSize({width,height:820});
      const actual=await page.evaluate(()=>({
        page:document.documentElement.scrollWidth,
        viewport:document.documentElement.clientWidth,
      }));
      assert.ok(actual.page<=actual.viewport+1,
        label+": width "+width+" overflow "+JSON.stringify(actual));
    }
    await page.setViewportSize({width:320,height:820});
  }
  async function menu(name){
    await page.getByRole("button",{name:"Abrir menu"}).click();
    await page.getByRole("dialog",{name:"Menu de navegação"})
      .getByRole("button",{name,exact:true}).click();
  }
  try{
    await page.goto("http://127.0.0.1:3000/",{waitUntil:"domcontentloaded"});
    await page.getByRole("button",{name:"Continuar como visitante"}).click();
    await page.getByText("CATEGORIAS DA LOJA",{exact:true}).first().waitFor();
    await noOverflow("home");
    await menu("Loja");
    await page.getByRole("heading",{name:"CATEGORIAS DA LOJA"}).waitFor();
    await noOverflow("store-categories");
    await page.getByRole("button",{name:/KITS PVP/}).first().click();
    await page.getByRole("heading",{name:"Kit PVP laboratório"}).waitFor();
    await noOverflow("store-product");
    await page.getByRole("button",{name:"Adicionar ao carrinho"}).first().click();
    await menu("VIPs");
    await page.getByRole("heading",{name:"Explorer laboratório"}).waitFor();
    await noOverflow("vip-category");
    await page.getByRole("button",{name:"Adicionar ao carrinho"}).first().click();
    await page.getByRole("button",{name:"Carrinho: 2 produtos"}).click();
    await page.getByRole("heading",{name:"Carrinho de compras"}).waitFor();
    await noOverflow("cart");
    await page.getByLabel("Cupom de desconto").fill("LOCALTEST");
    await page.getByRole("button",{name:"Conferir cupom"}).click();
    await page.getByText("Descontos (conferidos)").waitFor();
    await page.getByText("R$ 26,99").waitFor();
    // Increase kit quantity once; server recomputes discounts and total.
    await page.getByRole("button",{name:"Aumentar Kit PVP laboratório"}).click();
    await page.getByText("R$ 44,98").waitFor();
    await noOverflow("cart-with-coupon");
    await page.getByLabel("Gamertag Bedrock").fill("Lab Tester");
    await page.getByLabel("E-mail de teste").fill("lab@example.com");
    await page.getByLabel("CPF do comprador de teste").fill("12345678909");
    await page.getByRole("button",{name:"Gerar Pix de teste"}).click();
    await page.getByText("Aguardando pagamento",{exact:true}).waitFor();
    await page.getByRole("img",{name:"QR Code Pix de teste"}).waitFor();
    await noOverflow("pix-qr");
    assert.deepEqual(errors,[]);
    console.log("PASS browser: mobile home, store categories, product, VIPs, cart qty/coupon, Pix QR and 320/360/430/768/1280 overflow; all API calls mocked");
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
