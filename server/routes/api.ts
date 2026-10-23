import {pixRouter} from './pix.ts';
import {identityRouter} from './identity.ts';
import {paymentStatusPatch} from '../../src/lib/paymentStatus.ts';
import {revenueReport,brasiliaPeriod} from '../../src/lib/revenue.ts';
import { adminAuthRouter, requireAdmin, isValidAdminToken } from '../auth/admin.ts';
import {productCatalog,ProductCatalogError} from '../services/productCatalog.ts';
import {firestoreProducts} from '../services/firestoreProducts.ts';
import {quoteCart,validateCartRequest} from '../../src/lib/cartQuote.ts';
import {validateCategories} from '../../src/lib/storeCategories.ts';
import express, { type Request, type Response, type NextFunction } from 'express';
import crypto from 'crypto';
import { dbStore } from '../data/store.ts';
import type { Player } from '../../src/types/index.ts';

export const apiRouter = express.Router();

apiRouter.use('/admin', adminAuthRouter);
apiRouter.use(identityRouter);
apiRouter.use(pixRouter);
apiRouter.get('/admin/revenue',requireAdmin,async(req,res)=>{
 try{const period=typeof req.query.period==='string'?req.query.period:brasiliaPeriod(new Date())!;if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(period))return res.status(400).json({error:'Selecione mês e ano válidos.'});
 const {paymentDatabase}=await import('../payments/database.ts');
 const snapshot=await paymentDatabase().collection('orders').get();
 return res.json(revenueReport(snapshot.docs.map(d=>({...d.data(),sourceOrderId:d.data()?.id||d.id,id:d.id})),period));
 }catch{return res.status(503).json({error:'Não foi possível consultar os pedidos no Firebase. Nenhum valor foi estimado.'});}
});


// -------------------------------------------------------------
// PLAYER / ACCOUNT IDENTIFICATION
// -------------------------------------------------------------
apiRouter.post('/player/login', async (req, res) => {
  const { nickname } = req.body;
  if (!nickname || typeof nickname !== 'string') {
    return res.status(400).json({ error: 'Nickname é obrigatório.' });
  }

  const clean = nickname.trim();
  if (clean.length < 3 || clean.length > 32) {
    return res.status(400).json({ error: 'O nickname deve conter entre 3 e 32 caracteres.' });
  }

  const player = dbStore.getOrCreatePlayer(clean);

  // Sync to Firestore users collection
  try {
    const { db } = await import('../../src/lib/firebase.ts');
    const { doc, setDoc } = await import('firebase/firestore');
    await setDoc(doc(db, 'users', player.id), player);
  } catch (err) {
    console.warn('Firestore player sync notice:', err);
  }

  return res.json({
    success: true,
    player
  });
});

apiRouter.get('/player/:nickname', (req, res) => {
  const { nickname } = req.params;
  const clean = decodeURIComponent(nickname).trim();

  if (clean.length < 3 || clean.length > 32) {
    return res.status(400).json({
      error: 'O nickname deve conter entre 3 e 32 caracteres.'
    });
  }

  const player = dbStore.getPlayerByNickname(clean);
  if (!player) {
    return res.status(404).json({ error: 'Jogador não encontrado.' });
  }

  return res.json(player);
});

// Nickname-only login is not identity verification. Order history is private.
apiRouter.get('/player/:nickname/orders', requireAdmin, async (req, res) => {
  try {
    const nickname = req.params.nickname.trim().toLowerCase();
    const { paymentDatabase } = await import('../payments/database.ts');
    const docs = await paymentDatabase().collection('orders').get();
    res.setHeader('Cache-Control', 'no-store');
    return res.json(docs.docs.map(d => ({...d.data(), id:d.id}))
      .filter((o:any) => String(o.buyerNickname||'').toLowerCase() === nickname
        || String(o.recipientNickname||'').toLowerCase() === nickname));
  } catch {
    return res.status(503).json({error:'Não foi possível consultar o histórico privado.'});
  }
});

// -------------------------------------------------------------
// SERVER SETTINGS & INFRASTRUCTURE
// -------------------------------------------------------------
apiRouter.get('/settings', async (_req, res) => {
  await dbStore.syncFromFirestore().catch(() => {});
  res.json(dbStore.getSettings());
});

apiRouter.put('/admin/settings', requireAdmin, async (req, res) => {
  const updated = dbStore.updateSettings(req.body);
  try {
    const { db } = await import('../../src/lib/firebase.ts');
    const { doc, setDoc } = await import('firebase/firestore');
    await setDoc(doc(db, 'serverSettings', 'default'), updated);
  } catch (err) {
    console.warn('Firestore settings update notice:', err);
  }
  res.json(updated);
});

apiRouter.put('/admin/settings/livepix', requireAdmin, async (req, res) => {
  const { livePixUrl } = req.body;
  if (typeof livePixUrl !== 'string') {
    return res.status(400).json({ error: 'URL do LivePix inválida.' });
  }
  const clean = livePixUrl.trim();
  if (clean && !clean.startsWith('http://') && !clean.startsWith('https://')) {
    return res.status(400).json({ error: 'O link deve começar com http:// ou https://' });
  }
  const updated = dbStore.updateSettings({ livePixUrl: clean });
  try {
    const { db } = await import('../../src/lib/firebase.ts');
    const { doc, setDoc } = await import('firebase/firestore');
    await setDoc(doc(db, 'serverSettings', 'default'), updated);
  } catch (err) {
    console.warn('Firestore livepix update notice:', err);
  }
  res.json({
    success: true,
    message: 'Link do LivePix atualizado com sucesso.',
    livePixUrl: updated.livePixUrl,
    settings: updated
  });
});

apiRouter.put('/admin/settings/pix', requireAdmin, async (req, res) => {
  const { pixUrl } = req.body;
  if (typeof pixUrl !== 'string') {
    return res.status(400).json({ error: 'Link ou chave PIX inválido.' });
  }
  const clean = pixUrl.trim();
  const updated = dbStore.updateSettings({ pixUrl: clean });
  try {
    const { db } = await import('../../src/lib/firebase.ts');
    const { doc, setDoc } = await import('firebase/firestore');
    await setDoc(doc(db, 'serverSettings', 'default'), updated);
  } catch (err) {
    console.warn('Firestore pix update notice:', err);
  }
  res.json({
    success: true,
    message: 'Link de cobrança PIX atualizado com sucesso.',
    pixUrl: updated.pixUrl,
    settings: updated
  });
});

// -------------------------------------------------------------
// VIP PACKAGES
// -------------------------------------------------------------
apiRouter.get('/vips', async (req, res) => {
 try {
  const {paymentDatabase}=await import('../payments/database.ts');
  const snap=await paymentDatabase().collection('vips').get();
  const token=String(req.headers.authorization || '').replace(/^Bearer /,'');
  const includeInactive=req.query.all==='true' && isValidAdminToken(token);
  res.setHeader('Cache-Control','no-store');
  return res.json(snap.docs.map(d=>({...d.data(),id:d.id}))
   .filter((v:any)=>includeInactive || v.active===true)
   .sort((a:any,b:any)=>Number(a.order||0)-Number(b.order||0)));
 }catch{return res.status(503).json({error:'Não foi possível consultar os planos VIP.'});}
});

// VIP pricing must be persisted through the authenticated server, never a browser write.
function vipDraft(body:any, id:string) {
 const price = Number(body?.price);
 const name = typeof body?.name === 'string' ? body.name.trim() : '';
 const duration = typeof body?.duration === 'string' ? body.duration.trim() : '';
 if (!/^[a-zA-Z0-9_-]{2,128}$/.test(id) || !name || name.length > 120 ||
     !duration || duration.length > 80 || !Number.isFinite(price) ||
     price < 0 || price > 10000 || Math.abs(price*100-Math.round(price*100)) > 0.000001)
  throw new ProductCatalogError('Confira o nome, duração, identificador e preço do VIP.',400);
 return {
  id, name, price, duration,
  description: String(body.description || '').slice(0,10000),
  benefits: Array.isArray(body.benefits) ? body.benefits.filter((x:unknown)=>typeof x==='string').slice(0,100) : [],
  color: ['emerald','cyan','blue','purple','amber'].includes(body.color) ? body.color : 'emerald',
  image: typeof body.image === 'string' ? body.image.slice(0,850000) : 'crown',
  order: Number.isInteger(Number(body.order)) ? Math.max(0,Math.min(1000000,Number(body.order))) : 1,
  active: body.active !== false,
  categoryId: typeof body.categoryId === 'string' ? body.categoryId.slice(0,128) : 'vips',
  isPopular: body.isPopular === true,
  livepixUrl: typeof body.livepixUrl === 'string' ? body.livepixUrl.slice(0,2048) : '',
  pixUrl: typeof body.pixUrl === 'string' ? body.pixUrl.slice(0,2048) : ''
 };
}
apiRouter.post('/admin/vips', requireAdmin, async (req,res)=>{
 try {
  const id = typeof req.body?.id==='string' && req.body.id.trim() ? req.body.id.trim() : `vip-${crypto.randomUUID()}`;
  const vip = vipDraft(req.body,id);
  const {paymentDatabase}=await import('../payments/database.ts');
  const db=paymentDatabase(),ref=db.collection('vips').doc(id);
  await db.runTransaction(async tx=>{
   if((await tx.get(ref)).exists) throw new ProductCatalogError('Este VIP já existe. Atualize o catálogo.',409);
   tx.create(ref,vip);
  });
  dbStore.createVip(vip);
  return res.status(201).json(vip);
 } catch(error){return productError(res,error);}
});
apiRouter.put('/admin/vips/:id', requireAdmin, async(req,res)=>{
 try {
  const id=req.params.id;
  const {paymentDatabase}=await import('../payments/database.ts');
  const db=paymentDatabase(),ref=db.collection('vips').doc(id);
  let vip:any;
  await db.runTransaction(async tx=>{
   const snap=await tx.get(ref);
   if(!snap.exists) throw new ProductCatalogError('VIP não encontrado.',404);
   vip=vipDraft({...snap.data(),...req.body},id);
   tx.set(ref,vip);
  });
  dbStore.updateVip(id,vip);
  return res.json(vip);
 } catch(error){return productError(res,error);}
});
apiRouter.delete('/admin/vips/:id', requireAdmin, async(req,res)=>{
 try {
  const id=req.params.id;
  if(!/^[a-zA-Z0-9_-]{2,128}$/.test(id)) return res.status(400).json({error:'Identificador inválido.'});
  const {paymentDatabase}=await import('../payments/database.ts');
  await paymentDatabase().collection('vips').doc(id).delete();
  dbStore.deleteVip(id);
  return res.json({success:true,message:'VIP excluído com sucesso.',removed:true});
 }catch(error){return productError(res,error);}
});

// -------------------------------------------------------------
// STORE PRODUCTS
// -------------------------------------------------------------
// Read-only cart quote. Payment and fulfillment remain disabled for grouped carts.
apiRouter.post('/cart/quote', async (req,res)=>{
 try {
  validateCartRequest(req.body.lines);
  if(req.body.couponCode) return res.status(409).json({error:'Cupons indisponíveis para cobranças fixas.'});
  // The cart quote must use the same server-side Firestore Admin connection as Pix.
  // The browser Firebase SDK cannot reliably access Firestore from Vercel functions.
  const {paymentDatabase}=await import('../payments/database.ts');
  const db=paymentDatabase();
  const items=await Promise.all(req.body.lines.map(async(line:any)=>{const snap=await db.collection(line.productType==='vip'?'vips':'products').doc(line.productId).get();return snap.exists?{...snap.data(),id:snap.id}:null;}));
  res.setHeader('Cache-Control','no-store');
  return res.json(quoteCart(req.body.lines,items as any));
 }catch(error){
  if(error instanceof Error && (error.name==='PixError'||error.name==='CartQuoteError')) return res.status(400).json({error:error.message});
  return res.status(503).json({error:'Não foi possível consultar o catálogo no servidor. Tente novamente.'});
 }
});
apiRouter.put('/admin/store-categories',requireAdmin,async(req,res)=>{
 try {
  validateCategories(req.body?.categories);
  const { paymentDatabase } = await import('../payments/database.ts');
  await paymentDatabase().collection('settings').doc('storeCategories').set(
   { categories: req.body.categories },
   { merge: true },
  );
  return res.json({success:true});
 } catch (error) {
  const invalid = error instanceof Error && /categoria|category|categories|duplicad|obrigat|invalid/i.test(error.message);
  return res.status(invalid ? 400 : 503).json({
   error: invalid ? 'Confira os dados das categorias.' : 'Não foi possível salvar as categorias no servidor.',
  });
 }
});

// Public catalogue is served from the same authoritative database as Pix checkout.
// Never rely on the in-memory snapshot or a browser Firestore connection for prices.
apiRouter.get('/storefront/catalog', async (_req,res)=>{
 try {
  const {paymentDatabase}=await import('../payments/database.ts');
  const db=paymentDatabase();
  const [products,vips,settings]=await Promise.all([
   db.collection('products').get(),
   db.collection('vips').get(),
   db.collection('settings').doc('storeCategories').get()
  ]);
  const categories=settings.exists?settings.data()?.categories:undefined;
  if(categories!==undefined)validateCategories(categories);
  res.setHeader('Cache-Control','no-store');
  return res.json({
   products:products.docs.map(d=>({...d.data(),id:d.id})).filter((p:any)=>p.active===true),
   vips:vips.docs.map(d=>({...d.data(),id:d.id})).filter((v:any)=>v.active===true),
   categories:categories||null,
   environment:'test'
  });
 }catch{
  return res.status(503).json({error:'Não foi possível carregar o catálogo oficial.'});
 }
});

apiRouter.get('/products', async (req, res) => {
 try {
  const {paymentDatabase}=await import('../payments/database.ts');
  const snap=await paymentDatabase().collection('products').get();
  const token=String(req.headers.authorization || '').replace(/^Bearer /,'');
  const includeInactive=req.query.all==='true' && isValidAdminToken(token);
  const category=typeof req.query.category==='string'?req.query.category:null;
  res.setHeader('Cache-Control','no-store');
  return res.json(snap.docs.map(d=>({...d.data(),id:d.id}))
   .filter((p:any)=>(includeInactive||p.active===true)&&(!category||category==='all'||p.category===category))
   .sort((a:any,b:any)=>Number(a.order||0)-Number(b.order||0)));
 }catch{return res.status(503).json({error:'Não foi possível consultar os produtos.'});}
});

const productsAdmin=productCatalog(firestoreProducts);
function productError(res:express.Response,error:unknown){return res.status(error instanceof ProductCatalogError?error.status:503).json({error:error instanceof ProductCatalogError?error.message:'Não foi possível confirmar a alteração no Firebase. Tente novamente.'});}
apiRouter.post('/admin/products',requireAdmin,async(req,res)=>{try{const product=await productsAdmin.save({...req.body,id:req.body.id||`prod-${crypto.randomUUID()}`});dbStore.createProduct(product);return res.status(201).json(product);}catch(error){return productError(res,error);}});
apiRouter.put('/admin/products/:id',requireAdmin,async(req,res)=>{try{const product=await productsAdmin.save(req.body,req.params.id);dbStore.updateProduct(product.id,product);return res.json(product);}catch(error){return productError(res,error);}});
apiRouter.delete('/admin/products/:id',requireAdmin,async(req,res)=>{try{const result=await productsAdmin.remove(req.params.id);await dbStore.syncFromFirestore().catch(()=>{});return res.json(result);}catch(error){return productError(res,error);}});

// -------------------------------------------------------------
// ORDERS & CHECKOUT & GATEWAY WEBHOOK
// -------------------------------------------------------------
// Historical legacy orders stay intact; only authenticated admins may access them.
apiRouter.get('/orders', requireAdmin, async (_req, res) => {
  try {
    const {paymentDatabase}=await import('../payments/database.ts');
    const docs=await paymentDatabase().collection('orders').get();
    res.setHeader('Cache-Control','no-store');
    return res.json(docs.docs.map(d=>({...d.data(),id:d.id}))
      .sort((a:any,b:any)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''))));
  } catch {
    return res.status(503).json({error:'Não foi possível consultar os pedidos.'});
  }
});

apiRouter.get('/orders/:id', requireAdmin, async (req,res) => {
  try {
    const id=req.params.id;
    if(!id || id.includes('/'))return res.status(400).json({error:'ID inválido.'});
    const {paymentDatabase}=await import('../payments/database.ts');
    const doc=await paymentDatabase().collection('orders').doc(id).get();
    if(!doc.exists)return res.status(404).json({error:'Pedido não encontrado.'});
    res.setHeader('Cache-Control','no-store');
    return res.json({...doc.data(),id:doc.id});
  } catch {
    return res.status(503).json({error:'Não foi possível consultar o pedido.'});
  }
});

// Old checkout generated unverified payment links and untrusted local orders.
// The only available checkout is authenticated Mercado Pago Orders Pix Preview.
apiRouter.post('/orders', (_req,res) => {
  res.setHeader('Cache-Control','no-store');
  return res.status(410).json({
    error:'Checkout anterior desativado. Utilize o Pix de teste no carrinho.'
  });
});

// Webhook / Simulated Payment Confirmation
apiRouter.post('/orders/:id/simulate-payment', (_req,res) => res.status(410).json({error:'Simulação pública desativada. Pagamentos são confirmados somente pelo provedor.'}));

// Handler for Order Status Update with comprehensive Firestore sync and flexible ID parsing
const handleOrderStatusUpdate = async(req:express.Request,res:express.Response)=>{
 const id=String(req.params.id||req.body?.id||'').trim(), status=req.body?.status;
 if(!id || id.includes('/') || !['Pendente','Pago','Entregue','Cancelado','Reembolsado','Estornado'].includes(status))
  return res.status(400).json({error:'Pedido ou status inválido.'});
 try {
  const {paymentDatabase}=await import('../payments/database.ts');
  const db=paymentDatabase(),collection=db.collection('orders');
  let ref=collection.doc(id);
  if(!(await ref.get()).exists){
   const docs=await collection.get(), normalized=id.replace(/^#/,'').toLowerCase();
   const matches=docs.docs.filter(d=>[d.id,d.data().id,d.data().orderNumber]
    .some(v=>String(v||'').replace(/^#/,'').toLowerCase()===normalized));
   if(matches.length!==1)return res.status(matches.length?409:404)
    .json({error:'Pedido não encontrado de forma única. Informe o ID do documento.'});
   ref=matches[0].ref;
  }
  const updated=await db.runTransaction(async tx=>{
   const doc=await tx.get(ref);
   if(!doc.exists)throw new ProductCatalogError('Pedido não encontrado.',404);
   const current=doc.data()!;
   if(current.paymentProvider==='mercadopago' || (current.paymentId && current.environment==='test'))
    throw new ProductCatalogError('Pagamento controlado pelo provedor.',409);
   const patch=paymentStatusPatch(current,status,new Date().toISOString());
   tx.update(ref,patch);
   return {...current,...patch,id:doc.id};
  });
  res.setHeader('Cache-Control','no-store');
  return res.json(updated);
 }catch(error){return productError(res,error);}
};
apiRouter.put('/admin/orders/:id/status', requireAdmin, handleOrderStatusUpdate);
apiRouter.put('/admin/orders/status', requireAdmin, handleOrderStatusUpdate);

// --- COUPONS MANAGEMENT ROUTES ---

function couponDraft(input:any,id:string,previous?:any) {
 const code=String(input?.code ?? previous?.code ?? '').trim().toUpperCase();
 const discountType=input?.discountType ?? previous?.discountType;
 const discountValue=Number(input?.discountValue ?? previous?.discountValue);
 const minOrderValue=Number(input?.minOrderValue ?? previous?.minOrderValue ?? 0);
 const maxUsesRaw=input?.maxUses ?? previous?.maxUses;
 const maxUses=maxUsesRaw===null||maxUsesRaw===undefined||maxUsesRaw===''?null:Number(maxUsesRaw);
 if(!/^[a-zA-Z0-9_-]{2,128}$/.test(id) || !/^[A-Z0-9_-]{2,50}$/.test(code) ||
   !['percentage','fixed'].includes(discountType) ||
   !Number.isFinite(discountValue)||discountValue<=0||
   (discountType==='percentage'&&discountValue>100) ||
   !Number.isFinite(minOrderValue)||minOrderValue<0 ||
   (maxUses!==null&&(!Number.isSafeInteger(maxUses)||maxUses<1)))
  throw new ProductCatalogError('Confira o código e as regras do cupom.',400);
 const now=new Date().toISOString();
 return {
  ...previous,
  id,code,discountType,discountValue,minOrderValue,maxUses,
  usedCount:Number(previous?.usedCount || 0),
  expiresAt:input?.expiresAt ?? previous?.expiresAt ?? null,
  active:input?.active !== undefined ? input.active === true : previous?.active !== false,
  description:String(input?.description ?? previous?.description ?? '').slice(0,1000),
  createdAt:previous?.createdAt || now,updatedAt:now
 };
}
apiRouter.get('/admin/coupons',requireAdmin,async (_req,res)=>{
 try{
  const {paymentDatabase}=await import('../payments/database.ts');
  const snap=await paymentDatabase().collection('coupons').get();
  res.setHeader('Cache-Control','no-store');
  return res.json(snap.docs.map(d=>({...d.data(),id:d.id})));
 }catch{return res.status(503).json({error:'Não foi possível consultar os cupons.'});}
});
apiRouter.post('/admin/coupons',requireAdmin,async(req,res)=>{
 try{
  const id=typeof req.body?.id==='string'&&req.body.id.trim()?req.body.id.trim():`cupom-${crypto.randomUUID()}`;
  const coupon=couponDraft(req.body,id);
  const {paymentDatabase}=await import('../payments/database.ts');
  const db=paymentDatabase(),col=db.collection('coupons');
  if(!(await col.where('code','==',coupon.code).limit(1).get()).empty)
   throw new ProductCatalogError('Já existe um cupom com este código.',409);
  await col.doc(id).create(coupon);
  dbStore.createCoupon(coupon);
  return res.status(201).json(coupon);
 }catch(error){return productError(res,error);}
});
apiRouter.put('/admin/coupons/:id',requireAdmin,async(req,res)=>{
 try{
  const id=req.params.id;
  const {paymentDatabase}=await import('../payments/database.ts');
  const col=paymentDatabase().collection('coupons'),ref=col.doc(id);
  const snap=await ref.get();
  if(!snap.exists) throw new ProductCatalogError('Cupom não encontrado.',404);
  const coupon=couponDraft(req.body,id,snap.data());
  if(coupon.code!==snap.data()?.code &&
     !(await col.where('code','==',coupon.code).limit(1).get()).empty)
   throw new ProductCatalogError('Já existe um cupom com este código.',409);
  await ref.set(coupon);
  dbStore.updateCoupon(id,coupon);
  return res.json(coupon);
 }catch(error){return productError(res,error);}
});
apiRouter.delete('/admin/coupons/:id',requireAdmin,async(req,res)=>{
 try{
  const id=req.params.id;
  if(!/^[a-zA-Z0-9_-]{2,128}$/.test(id))return res.status(400).json({error:'Identificador inválido.'});
  const {paymentDatabase}=await import('../payments/database.ts');
  await paymentDatabase().collection('coupons').doc(id).delete();
  dbStore.deleteCoupon(id);
  return res.json({success:true,message:'Cupom excluído com sucesso.'});
 }catch(error){return productError(res,error);}
});

apiRouter.post('/coupons/validate', async (req, res) => {
  const { code, amount } = req.body;
  if (!code || typeof code !== 'string' || !code.trim()) {
    return res.status(400).json({ valid: false, error: 'Código de cupom não informado.' });
  }

  const cleanCode = code.trim().toUpperCase();
  const numAmount = Number(amount) || 0;

  let coupon: any = null;
  try {
    const {paymentDatabase}=await import('../payments/database.ts');
    const docs=await paymentDatabase().collection('coupons').where('code','==',cleanCode).limit(2).get();
    if(docs.size > 1) return res.status(409).json({valid:false,error:'Cupom duplicado. Contate o suporte.'});
    if(docs.size === 1) coupon={...docs.docs[0].data(),id:docs.docs[0].id};
  }catch{
    return res.status(503).json({valid:false,error:'Não foi possível validar o cupom no servidor.'});
  }

  if (!coupon) {
    try {
      const { db } = await import('../../src/lib/firebase.ts');
      const { getDocs, collection } = await import('firebase/firestore');
      const snap = await getDocs(collection(db, 'coupons'));
      for (const d of snap.docs) {
        const data = d.data();
        if (data.code && String(data.code).trim().toUpperCase() === cleanCode) {
          coupon = { ...data, id: d.id } as any;
          break;
        }
      }
    } catch {}
  }

  if (!coupon) {
    return res.status(404).json({ valid: false, error: `Cupom "${cleanCode}" não encontrado.` });
  }

  if (!coupon.active) {
    return res.status(400).json({ valid: false, error: 'Este cupom está desativado no momento.' });
  }

  if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() < Date.now()) {
    return res.status(400).json({ valid: false, error: 'Este cupom expirou.' });
  }

  if (coupon.maxUses && Number(coupon.usedCount || 0) >= Number(coupon.maxUses)) {
    return res.status(400).json({ valid: false, error: 'O limite de utilizações deste cupom foi atingido.' });
  }

  if (coupon.minOrderValue && numAmount < Number(coupon.minOrderValue)) {
    return res.status(400).json({
      valid: false,
      error: `Valor mínimo do pedido para este cupom é de R$ ${Number(coupon.minOrderValue).toFixed(2).replace('.', ',')}.`
    });
  }

  let discountAmount = 0;
  if (coupon.discountType === 'percentage') {
    discountAmount = Number(((numAmount * coupon.discountValue) / 100).toFixed(2));
  } else {
    discountAmount = Math.min(numAmount, Number(coupon.discountValue));
  }
  const finalAmount = Math.max(0, Number((numAmount - discountAmount).toFixed(2)));

  return res.json({
    valid: true,
    coupon: {
      id: coupon.id,
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      description: coupon.description
    },
    discountAmount,
    finalAmount,
    message: coupon.discountType === 'percentage'
      ? `Cupom ${coupon.code} aplicado! Desconto de ${coupon.discountValue}% (-R$ ${discountAmount.toFixed(2).replace('.', ',')})`
      : `Cupom ${coupon.code} aplicado! Desconto de R$ ${discountAmount.toFixed(2).replace('.', ',')}`
  });
});

// Explicit authenticated legacy administration; provider-controlled orders are
// never deleted or marked paid through these routes.
function isProviderManagedLegacyOrder(value:any) {
 return value?.paymentProvider === 'mercadopago' ||
  (Boolean(value?.paymentId) && value?.environment === 'test');
}
apiRouter.post('/admin/orders/bulk-delete',requireAdmin,async(req,res)=>{
 const filter=req.body?.filter;
 if(!['all','concluidos','pendentes','cancelados'].includes(filter))
  return res.status(400).json({error:'Filtro de exclusão inválido.'});
 try{
  const {paymentDatabase}=await import('../payments/database.ts');
  const db=paymentDatabase(),snap=await db.collection('orders').get();
  const shouldDelete=(o:any)=>filter==='all' ||
    (filter==='concluidos'&&['Entregue','Pago'].includes(o.status)) ||
    (filter==='pendentes'&&o.status==='Pendente') ||
    (filter==='cancelados'&&o.status==='Cancelado');
  const selected=snap.docs.filter(d=>!isProviderManagedLegacyOrder(d.data())&&shouldDelete(d.data()));
  // Batch limit: Firestore allows up to 500 writes per commit.
  for(let i=0;i<selected.length;i+=400){
   const batch=db.batch();
   for(const d of selected.slice(i,i+400))batch.delete(d.ref);
   await batch.commit();
  }
  // No test Pix documents are touched: they are held in pixTestOrders.
  const deletedIds=selected.map(d=>d.id);
  const deleted=new Set(deletedIds);
  const remaining=snap.docs.filter(d=>!deleted.has(d.id)).map(d=>({...d.data(),id:d.id}));
  res.setHeader('Cache-Control','no-store');
  return res.json({
   success:true,message:`${deletedIds.length} pedidos legados excluídos.`,
   deletedCount:deletedIds.length,deletedIds,orders:remaining
  });
 }catch{return res.status(503).json({error:'Não foi possível concluir a exclusão no banco.'});}
});
apiRouter.delete('/admin/orders/:id',requireAdmin,async(req,res)=>{
 try{
  const id=String(req.params.id||'').trim();
  if(!id||id.includes('/'))return res.status(400).json({error:'Identificador inválido.'});
  const {paymentDatabase}=await import('../payments/database.ts');
  const db=paymentDatabase(),col=db.collection('orders');
  let ref=col.doc(id), snap=await ref.get();
  if(!snap.exists){
   const all=await col.get(),normalized=id.replace(/^#/,'').toLowerCase();
   const matches=all.docs.filter(d=>[d.id,d.data().id,d.data().orderNumber]
    .some(v=>String(v||'').replace(/^#/,'').toLowerCase()===normalized));
   if(matches.length!==1)return res.status(matches.length?409:404).json({error:'Pedido não encontrado de forma única.'});
   ref=matches[0].ref;snap=matches[0];
  }
  if(isProviderManagedLegacyOrder(snap.data()))
   return res.status(409).json({error:'Pedido vinculado ao provedor. Não pode ser excluído.'});
  await ref.delete();
  return res.json({success:true,message:'Pedido legado excluído.',removed:true});
 }catch{return res.status(503).json({error:'Falha na exclusão do pedido.'});}
});

// -------------------------------------------------------------
// EVENTS
// -------------------------------------------------------------
apiRouter.get('/events', (req, res) => {
  const includeAll = req.query.all === 'true';
  res.json(dbStore.getEvents(includeAll));
});

apiRouter.post('/admin/events', requireAdmin, (req, res) => {
  const { name, description, date, time, status, image, rewards, published, location } = req.body;
  if (!name || !description || !date) {
    return res.status(400).json({ error: 'Dados do evento incompletos.' });
  }

  const newEv = dbStore.createEvent({
    name,
    description,
    date,
    time: time || '19:00',
    status: status || 'Próximo',
    image: image || 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=800&q=80',
    rewards: Array.isArray(rewards) ? rewards : [],
    published: published !== false,
    location: location || '/warp eventos'
  });

  res.status(201).json(newEv);
});

apiRouter.put('/admin/events/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const updated = dbStore.updateEvent(id, req.body);
  if (!updated) {
    return res.status(404).json({ error: 'Evento não encontrado.' });
  }
  res.json(updated);
});

apiRouter.delete('/admin/events/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const name = typeof req.query.name === 'string' ? req.query.name : req.body?.name;
  const deleted = dbStore.deleteEvent(id, name);
  res.json({ success: true, message: 'Evento excluído com sucesso.', removed: deleted });
});

// -------------------------------------------------------------
// NEWS
// -------------------------------------------------------------
apiRouter.get('/news', (req, res) => {
  const includeAll = req.query.all === 'true';
  res.json(dbStore.getNews(includeAll));
});

apiRouter.post('/admin/news', requireAdmin, (req, res) => {
  const { title, content, summary, image, author, category, published } = req.body;
  if (!title || !content) {
    return res.status(400).json({ error: 'Título e conteúdo são obrigatórios.' });
  }

  const article = dbStore.createNews({
    title,
    content,
    summary: summary || title,
    image: image || 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=800&q=80',
    date: new Date().toISOString().split('T')[0],
    author: author || 'Equipe NetCraftBR',
    published: published !== false,
    category: category || 'Atualização'
  });

  res.status(201).json(article);
});

apiRouter.put('/admin/news/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const updated = dbStore.updateNews(id, req.body);
  if (!updated) {
    return res.status(404).json({ error: 'Notícia não encontrada.' });
  }
  res.json(updated);
});

apiRouter.delete('/admin/news/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const name = typeof req.query.name === 'string' ? req.query.name : (typeof req.query.title === 'string' ? req.query.title : req.body?.title || req.body?.name);
  const deleted = dbStore.deleteNews(id, name);
  res.json({ success: true, message: 'Notícia excluída com sucesso.', removed: deleted });
});

// -------------------------------------------------------------
// COMMUNITY & SOCIAL LINKS
// -------------------------------------------------------------
apiRouter.get('/community', (_req, res) => {
  res.json(dbStore.getSocialLinks());
});

apiRouter.post('/admin/community', requireAdmin, (req, res) => {
  const { name, platform, url, icon, active, description, memberCount, order } = req.body;
  if (!name || !url) {
    return res.status(400).json({ error: 'Nome e URL são obrigatórios.' });
  }

  const newLink = dbStore.createSocialLink({
    name,
    platform: platform || 'discord',
    url,
    icon: icon || 'message-square',
    active: active !== false,
    description: description || '',
    memberCount: memberCount || '',
    order: Number(order) || 1
  });

  res.status(201).json(newLink);
});

apiRouter.put('/admin/community/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const updated = dbStore.updateSocialLink(id, req.body);
  if (!updated) {
    return res.status(404).json({ error: 'Rede social não encontrada.' });
  }
  res.json(updated);
});

apiRouter.delete('/admin/community/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const name = typeof req.query.name === 'string' ? req.query.name : req.body?.name;
  const deleted = dbStore.deleteSocialLink(id, name);
  res.json({ success: true, message: 'Rede social excluída com sucesso.', removed: deleted });
});

// -------------------------------------------------------------
// SUPPORT TICKETS
// -------------------------------------------------------------
apiRouter.get('/tickets', (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader && isValidAdminToken(authHeader.replace('Bearer ', '').trim())) {
    return res.json(dbStore.getTickets());
  }
  const nickname = typeof req.query.nickname === 'string' ? req.query.nickname.toLowerCase() : null;
  if (nickname) {
    return res.json(dbStore.getTickets().filter(t => t.nickname.toLowerCase() === nickname));
  }
  res.json([]);
});

apiRouter.post('/tickets', (req, res) => {
  const { nickname, category, subject, message } = req.body;
  if (!nickname || !category || !subject || !message) {
    return res.status(400).json({ error: 'Preencha todos os campos do chamado.' });
  }

  const ticket = dbStore.createTicket({
    nickname,
    category,
    subject,
    message
  });
  res.status(201).json(ticket);
});

apiRouter.put('/admin/tickets/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const updated = dbStore.updateTicket(id, req.body);
  if (!updated) {
    return res.status(404).json({ error: 'Chamado não encontrado.' });
  }
  res.json(updated);
});

// -------------------------------------------------------------
// ADMIN DASHBOARD & PLAYERS MANAGEMENT
// -------------------------------------------------------------
apiRouter.get('/admin/stats', requireAdmin, (_req, res) => {
  res.json(dbStore.getDashboardStats());
});

apiRouter.get('/admin/players', requireAdmin, async (req, res) => {
  const search = typeof req.query.search === 'string' ? req.query.search.toLowerCase() : '';

  // Synchronize any Firestore users so no registration is ever missed
  try {
    const { db } = await import('../../src/lib/firebase.ts');
    const { collection, getDocs } = await import('firebase/firestore');
    const snap = await getDocs(collection(db, 'users'));
    snap.forEach(d => {
      const u = d.data() as Player;
      if (u.nickname) {
        dbStore.getOrCreatePlayer(u.nickname);
      }
    });
  } catch {
    // ignore
  }

  let players = dbStore.getPlayers();
  if (search) {
    players = players.filter(p => p.nickname.toLowerCase().includes(search));
  }
  res.json(players);
});

apiRouter.post('/admin/players', requireAdmin, async (req, res) => {
  const { nickname, vipId } = req.body;
  if (!nickname || typeof nickname !== 'string') {
    return res.status(400).json({ error: 'Nickname é obrigatório.' });
  }

  const clean = nickname.trim();
  if (clean.length < 3 || clean.length > 32) {
    return res.status(400).json({ error: 'O nickname deve conter entre 3 e 32 caracteres.' });
  }

  let player = dbStore.getOrCreatePlayer(clean);

  if (vipId) {
    const vip = dbStore.getVipById(vipId);
    if (vip) {
      const isLifetime = vip.duration.toLowerCase().includes('vitalício');
      const now = new Date();
      const expiresAt = isLifetime ? null : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const activeVips = [...player.activeVips];
      const existingIdx = activeVips.findIndex(v => v.vipId === vip.id);
      if (existingIdx >= 0) {
        activeVips[existingIdx].expiresAt = expiresAt;
      } else {
        activeVips.push({
          vipId: vip.id,
          vipName: `VIP ${vip.name}`,
          activatedAt: now.toISOString(),
          expiresAt
        });
      }
      const updated = dbStore.updatePlayer(player.id, { activeVips });
      if (updated) player = updated;
    }
  }

  // Sync to Firestore
  try {
    const { db } = await import('../../src/lib/firebase.ts');
    const { doc, setDoc } = await import('firebase/firestore');
    await setDoc(doc(db, 'users', player.id), player);
  } catch {
    // ignore
  }

  res.status(201).json(player);
});

apiRouter.delete('/admin/players/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const nickname = typeof req.query.nickname === 'string' ? req.query.nickname : (typeof req.query.name === 'string' ? req.query.name : req.body?.nickname);
  const deleted = dbStore.deletePlayer(id, nickname);
  res.json({ success: true, message: 'Jogador excluído com sucesso.', removed: deleted });
});
