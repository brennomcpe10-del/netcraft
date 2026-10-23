import crypto from "node:crypto";
import type { Player, VIP, ActiveVip } from "../../src/types/index.ts";
import { paymentDatabase } from "../payments/database.ts";

export class PlayerError extends Error {
  constructor(message: string, public readonly statusCode=400) { super(message); }
}
export function normalizeNickname(value: unknown): string {
  if(typeof value!=="string")throw new PlayerError("Nickname obrigatório.");
  const name=value.trim();
  if(!/^[A-Za-z0-9_ ]{3,32}$/.test(name))
    throw new PlayerError("Nickname deve ter de 3 a 32 caracteres, usando letras, números, espaços ou _.");
  return name;
}
const stableId=(nickname:string)=>"player-"+crypto.createHash("sha256").update(nickname.toLowerCase()).digest("hex").slice(0,40);
const idValid=(id:string)=>/^[A-Za-z0-9_-]{2,128}$/.test(id);
function safeProfile(value:any, id:string): Player {
 const createdAt=typeof value?.createdAt==="string"?value.createdAt:new Date().toISOString();
 return {
  id,
  nickname:normalizeNickname(value?.nickname),
  createdAt,
  lastActive:typeof value?.lastActive==="string"?value.lastActive:createdAt,
  // VIP and spending are descriptive only; never authorize fulfillment from these fields.
  activeVips:Array.isArray(value?.activeVips)?value.activeVips.filter((v:any)=>
   v&&typeof v.vipId==="string"&&typeof v.vipName==="string").slice(0,30):[],
  totalSpent:typeof value?.totalSpent==="number"&&Number.isFinite(value.totalSpent)?value.totalSpent:0,
  ordersCount:Number.isSafeInteger(value?.ordersCount)&&value.ordersCount>=0?value.ordersCount:0,
  ...(typeof value?.avatarUrl==="string"?{avatarUrl:value.avatarUrl.slice(0,2048)}:{}),
  ...(typeof value?.bio==="string"?{bio:value.bio.slice(0,1000)}:{}),
 };
}
async function findExisting(nickname:string) {
 const db=paymentDatabase(),lower=nickname.toLowerCase();
 const [users,players]=await Promise.all([
  db.collection("users").get(),db.collection("players").get(),
 ]);
 // Canonical users collection wins; never trust arbitrary client-provided IDs.
 const found=users.docs.find(d=>String(d.data().nickname||"").trim().toLowerCase()===lower)||
  players.docs.find(d=>String(d.data().nickname||"").trim().toLowerCase()===lower);
 return found||null;
}
export async function publicPlayer(nicknameValue:unknown, create=false):Promise<Player|null> {
 const nickname=normalizeNickname(nicknameValue),db=paymentDatabase();
 const found=await findExisting(nickname);
 if(found) return safeProfile(found.data(),found.id);
 if(!create)return null;
 const ref=db.collection("users").doc(stableId(nickname));
 const data=await db.runTransaction(async tx=>{
  const old=await tx.get(ref);
  if(old.exists)return old.data()!;
  const now=new Date().toISOString();
  const next={id:ref.id,nickname,nicknameLower:nickname.toLowerCase(),
   createdAt:now,lastActive:now,activeVips:[],totalSpent:0,ordersCount:0};
  tx.create(ref,next);
  return next;
 });
 return safeProfile(data,ref.id);
}
export async function listAdminPlayers(search: unknown):Promise<Player[]> {
 const query=typeof search==="string"?search.trim().toLowerCase().slice(0,64):"";
 const db=paymentDatabase(),[users,players]=await Promise.all([
  db.collection("users").get(),db.collection("players").get()
 ]);
 const map=new Map<string,Player>();
 for(const snap of [...users.docs,...players.docs]){
  try{
   const profile=safeProfile(snap.data(),snap.id),key=profile.nickname.toLowerCase();
   if(!map.has(key))map.set(key,profile);
  }catch { /* Ignore malformed legacy profiles, do not rewrite them. */ }
 }
 return [...map.values()].filter(p=>!query||p.nickname.toLowerCase().includes(query))
  .sort((a,b)=>a.nickname.localeCompare(b.nickname,"pt-BR"));
}
export async function adminCreatePlayer(nicknameValue:unknown,vipIdValue:unknown):Promise<Player> {
 const nickname=normalizeNickname(nicknameValue);
 const existing=await findExisting(nickname);
 const id=existing?.id||stableId(nickname);
 if(!idValid(id))throw new PlayerError("ID antigo do jogador inválido.",409);
 const db=paymentDatabase(),ref=db.collection("users").doc(id);
 let vip:VIP|null=null;
 if(vipIdValue!==undefined&&vipIdValue!==null&&vipIdValue!==""){
  if(typeof vipIdValue!=="string"||!idValid(vipIdValue))throw new PlayerError("VIP inválido.");
  const s=await db.collection("vips").doc(vipIdValue).get();
  if(!s.exists)throw new PlayerError("VIP não encontrado.",404);
  vip={...s.data(),id:s.id} as VIP;
 }
 const data=await db.runTransaction(async tx=>{
  const snap=await tx.get(ref);
  const current=snap.exists?snap.data()!:(existing?.data()||{});
  const now=new Date().toISOString();
  const draft={...current,id,nickname,nicknameLower:nickname.toLowerCase(),
   createdAt:current.createdAt||now,lastActive:now,
   activeVips:Array.isArray(current.activeVips)?current.activeVips:[],
   totalSpent:typeof current.totalSpent==="number"?current.totalSpent:0,
   ordersCount:Number.isSafeInteger(current.ordersCount)?current.ordersCount:0};
  if(vip){
   const expiresAt=vip.duration.toLowerCase().includes("vitalício")?null:
    new Date(Date.now()+30*24*3600000).toISOString();
   const item:ActiveVip={vipId:vip.id,vipName:`VIP ${vip.name}`,
    activatedAt:now,expiresAt};
   draft.activeVips=[...draft.activeVips.filter((v:any)=>v.vipId!==vip!.id),item];
  }
  tx.set(ref,draft);
  return draft;
 });
 return safeProfile(data,id);
}
export async function adminDeletePlayer(id:unknown):Promise<boolean> {
 if(typeof id!=="string"||!idValid(id))throw new PlayerError("ID inválido.");
 const db=paymentDatabase(),users=db.collection("users").doc(id),
  players=db.collection("players").doc(id);
 const [u,p]=await Promise.all([users.get(),players.get()]);
 if(!u.exists&&!p.exists)return false;
 const batch=db.batch();
 if(u.exists)batch.delete(users);
 if(p.exists)batch.delete(players);
 await batch.commit();
 return true;
}
