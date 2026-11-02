const {chromium}=require("playwright");
const assert=require("node:assert/strict");
(async()=>{
 assert.equal(process.env.NC_STORE_BROWSER_TEST,"1");
 assert.ok(!process.env.VERCEL_ENV&&!process.env.MERCADOPAGO_ACCESS_TOKEN);
 const id=c=>c.repeat(64);
 const order=(c,state)=>({
  id:id(c),environment:"test",state,gamertag:"Lab "+c.toUpperCase(),
  totalCents:2590,linesCount:1,createdAt:"2026-11-02T09:00:00.000Z",
  approvedAt:state==="approved"?"2026-11-02T09:01:00.000Z":null,
  approvalObservedAt:null,providerOrderId:"ORDTST-"+c,expiresAt:null,
 });
 const job=(c,hold)=>({
  id:id(c)+"-0",orderId:id(c),gamertag:"Lab "+c.toUpperCase(),
  kind:"items",units:2,state:"pending",hold,dispatchEnabled:false,
  createdAt:"2026-11-02T09:02:00.000Z",
 });
 const browser=await chromium.launch({
  executablePath:process.env.TEST_CHROME_PATH||undefined,
  headless:true,args:["--no-sandbox","--disable-dev-shm-usage"],
 });
 const context=await browser.newContext({viewport:{width:320,height:800}});
 const errors=[];
 await context.route(/https:\/\//,route=>route.abort());
 await context.route("**/api/**",async route=>{
  const path=new URL(route.request().url()).pathname;
  let value=[],status=200;
  switch(path){
   case "/api/admin/login":value={success:true,token:"adm-fixture-signed-not-real"};break;
   case "/api/admin/verify":value={authenticated:true};break;
   case "/api/admin/revenue":value={
    totalCents:0,currentMonthCents:0,periodCents:0,currentPeriod:"2026-11",
    confirmedPayments:0,duplicates:0,missingApprovalDates:0,
    uncertainPayments:0,
   };break;
   case "/api/admin/environment":value={
    environment:"preview",isolatedPlayerAndSupportData:true,
    isolatedPreviewCatalog:true,isolatedPreviewCoupons:true,
    sharedStoreData:true,storeWritesBlocked:true,
   };break;
   case "/api/admin/pix-test-orders":
    value=[order("a","approved"),order("b","pending"),order("c","approved"),
      order("d","refunded")];break;
   case "/api/admin/pix-test-deliveries":
    value=[job("a","dispatch_disabled"),job("c","reward_invalid"),
      job("d","refunded")];break;
   case "/api/admin/delivery-catalog-audit":value={
    environment:"preview",realPaymentsEnabled:false,
    minecraftDispatchEnabled:false,totalActive:0,truncated:false,
    counts:{reward_invalid:0,reward_missing:0,quantity_exceeds_executor:0,
      vip_mapping_required:0,kit_lab_only:0},items:[],
   };break;
   case "/api/settings":value={};break;
   case "/api/storefront/catalog":value={products:[],vips:[],categories:[],environment:"test"};break;
   case "/api/admin/coupons":value=[];break;
   case "/api/orders":value=[];break;
   default: if(path.startsWith("/api/admin/")||path.startsWith("/api/player/"))
     value=[];else value=[];
  }
  await route.fulfill({status,contentType:"application/json",body:JSON.stringify(value)});
 });
 const page=await context.newPage();
 page.on("pageerror",err=>errors.push(err.message));
 try {
  await page.goto("http://127.0.0.1:3000/admin",{waitUntil:"domcontentloaded"});
  await page.getByLabel("Senha administrativa").fill("isolated-test-password");
  await page.getByRole("button",{name:"Acessar Painel"}).click();
  await page.getByText("Painel Administrativo NetCraftBR",{exact:true}).waitFor();
  await page.getByRole("button",{name:"Pedidos",exact:true}).click();
  await page.getByRole("heading",{name:/Acompanhamento de Pix e entregas/}).waitFor();
  await page.getByText("Lab A · 1 item(ns)").waitFor();
  await page.getByText("Lab D · 1 item(ns)").waitFor();
  const search=page.getByRole("searchbox",{name:"Buscar Pix de teste"});
  await search.fill("Lab C");
  await page.getByText("Lab C · 1 item(ns)").waitFor();
  assert.equal(await page.getByText("Lab A · 1 item(ns)").count(),0);
  await page.getByRole("button",{name:"Ver pagamento e entregas"}).click();
  await page.getByText("Recompensa inválida").waitFor();
  await search.fill("");
  await page.getByRole("combobox",{name:"Filtrar Pix de teste"}).selectOption("attention");
  await page.getByText("Lab C · 1 item(ns)").waitFor();
  assert.equal(await page.getByText("Lab B · 1 item(ns)").count(),0);
  await page.getByRole("combobox",{name:"Filtrar Pix de teste"}).selectOption("closed");
  await page.getByText("Lab D · 1 item(ns)").waitFor();
  await page.getByRole("combobox",{name:"Filtrar Pix de teste"}).selectOption("all");
  for(const width of [320,360,430,768,1280]){
   await page.setViewportSize({width,height:820});
   const data=await page.evaluate(()=>({
    scrollWidth:document.documentElement.scrollWidth,
    clientWidth:document.documentElement.clientWidth,
   }));
   assert.ok(data.scrollWidth<=data.clientWidth+1,
    "Monitor overflows width "+width+": "+JSON.stringify(data));
  }
  assert.deepEqual(errors,[]);
  console.log("PASS browser: authenticated TEST monitor, Pix/job status, search, review filter, expanding holds, 320-1280px and zero live requests");
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
