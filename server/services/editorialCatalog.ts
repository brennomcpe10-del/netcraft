import crypto from "node:crypto";
import { paymentDatabase } from "../payments/database.ts";

export type EditorialKind = "events" | "news" | "community";
const idPattern = /^[a-zA-Z0-9_-]{2,128}$/;

export class EditorialError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

const field = (value: unknown, limit: number, fallback = "") =>
  typeof value === "string" ? value.trim().slice(0, limit) : fallback;

export function normalizeEditorial(
  kind: EditorialKind,
  input: any,
  previous: any = {},
) {
  const value = { ...previous, ...input };
  const name = field(value.name, 120);
  const image = field(value.image, 850000);
  if (kind === "events") {
    const description = field(value.description, 10000);
    const date = field(value.date, 40);
    if (!name || !description || !date)
      throw new EditorialError("Informe nome, descrição e data do evento.");
    return {
      name, description, date,
      time: field(value.time, 20, "19:00") || "19:00",
      status: ["Próximo", "Em andamento", "Encerrado"].includes(value.status)
        ? value.status : "Próximo",
      image: image || "/hero_landscape.webp",
      rewards: Array.isArray(value.rewards)
        ? value.rewards.filter((r:unknown)=>typeof r==="string").slice(0,100).map((r:string)=>r.slice(0,150))
        : [],
      published: value.published !== false,
      location: field(value.location, 250, "/warp eventos") || "/warp eventos",
      ...(Number.isFinite(Number(value.order)) ? {order:Number(value.order)} : {})
    };
  }
  if (kind === "news") {
    const title = field(value.title, 150);
    const body = field(value.content, 50000);
    if (!title || !body)
      throw new EditorialError("Informe título e conteúdo da notícia.");
    return {
      title, content: body,
      summary: field(value.summary, 500, title) || title,
      image: image || "/hero_landscape.webp",
      date: field(value.date, 40, new Date().toISOString().slice(0,10)),
      author: field(value.author, 100, "Equipe NetCraftBR") || "Equipe NetCraftBR",
      category: ["Atualização","Evento","Manutenção","Novidade"].includes(value.category)
        ? value.category : "Atualização",
      published: value.published !== false,
    };
  }
  const url = field(value.url, 2048);
  if (!name || !/^https:\/\/[^\s/]+/i.test(url))
    throw new EditorialError("Informe nome e URL HTTPS válida da comunidade.");
  return {
    name, url,
    platform: ["discord","youtube","tiktok","instagram","whatsapp","twitter","site","outros"].includes(value.platform)
      ? value.platform : "outros",
    icon: field(value.icon, 100, "message-square"),
    active: value.active !== false,
    description: field(value.description, 2000),
    memberCount: field(value.memberCount, 100),
    order: Number.isInteger(Number(value.order)) ? Math.max(0,Math.min(1000000,Number(value.order))) : 1,
  };
}

export function editorialRepository(kind: EditorialKind) {
  const collection = () => paymentDatabase().collection(kind);
  const publicEntries = async (all: boolean) => {
    const snapshot = await collection().get();
    return snapshot.docs.map(d=>({...d.data(),id:d.id})).filter((doc:any)=>
      all || (kind==="events"||kind==="news" ? doc.published!==false : doc.active!==false));
  };
  const save = async (input: unknown,id?: string) => {
    const nextId=id || `${kind}-${crypto.randomUUID()}`;
    if(!idPattern.test(nextId))throw new EditorialError("Identificador inválido.");
    const ref=collection().doc(nextId);
    const result=await paymentDatabase().runTransaction(async tx=>{
      const old=await tx.get(ref);
      if(id && !old.exists)throw new EditorialError("Registro não encontrado.",404);
      if(!id && old.exists)throw new EditorialError("Registro duplicado.",409);
      const data=normalizeEditorial(kind,input,old.data()||{});
      const record={...old.data(),...data,id:nextId};
      tx.set(ref,record);
      return record;
    });
    return result;
  };
  const remove = async (id: string) => {
    if(!idPattern.test(id))throw new EditorialError("Identificador inválido.");
    const ref=collection().doc(id);
    if(!(await ref.get()).exists)throw new EditorialError("Registro não encontrado.",404);
    await ref.delete();
    return {success:true,removed:true};
  };
  return {publicEntries,save,remove};
}
