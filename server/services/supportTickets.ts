import crypto from "node:crypto";
import type { SupportTicket } from "../../src/types/index.ts";
import { paymentDatabase } from "../payments/database.ts";

export class TicketError extends Error {
  constructor(message: string, public readonly statusCode = 400) { super(message); }
}
const categories = new Set(["compra", "vip", "duvida", "bug", "outro"]);
const statuses = new Set(["Aberto", "Em andamento", "Resolvido", "Fechado"]);
const validId = (id: string) => /^[a-zA-Z0-9_-]{2,128}$/.test(id);
function safeText(value: unknown, max: number, field: string): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max)
    throw new TicketError(`Campo inválido: ${field}.`);
  return value.trim();
}
export function ticketDraft(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TicketError("Chamado inválido.");
  const item = value as Record<string, unknown>;
  const nickname = safeText(item.nickname, 32, "nickname");
  if (nickname.length < 3) throw new TicketError("Nickname inválido.");
  const category = safeText(item.category, 20, "categoria");
  if (!categories.has(category)) throw new TicketError("Categoria inválida.");
  return {
    nickname,
    category,
    subject: safeText(item.subject, 160, "assunto"),
    message: safeText(item.message, 8000, "mensagem"),
  };
}

export function ticketUpdateDraft(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TicketError("Atualização inválida.");
  const item = value as Record<string, unknown>;
  if (!Object.keys(item).length || Object.keys(item).some(k=>!["status","reply"].includes(k)))
    throw new TicketError("Somente status e resposta podem ser alterados.");
  const update: Pick<Partial<SupportTicket>, "status" | "reply" | "repliedAt"> = {};
  if (item.status !== undefined) {
    if (typeof item.status !== "string" || !statuses.has(item.status))
      throw new TicketError("Status inválido.");
    update.status = item.status as SupportTicket["status"];
  }
  if (item.reply !== undefined) {
    if (typeof item.reply !== "string" || item.reply.length > 8000)
      throw new TicketError("Resposta inválida.");
    update.reply = item.reply.trim();
    update.repliedAt = new Date().toISOString();
  }
  return update;
}
export async function listAdminTickets(): Promise<SupportTicket[]> {
  const snapshot = await paymentDatabase().collection("tickets").get();
  return snapshot.docs.map(doc=>({...doc.data(),id:doc.id} as SupportTicket))
    .sort((a,b)=>String(b.createdAt||"").localeCompare(String(a.createdAt||"")));
}
export async function createSupportTicket(value: unknown): Promise<SupportTicket> {
  const draft = ticketDraft(value);
  const id = `TCK-${crypto.randomUUID()}`;
  const ticket: SupportTicket = {...draft,id,status:"Aberto",createdAt:new Date().toISOString()};
  await paymentDatabase().collection("tickets").doc(id).create(ticket);
  return ticket;
}
export async function updateSupportTicket(id: string, value: unknown): Promise<SupportTicket> {
  if(!validId(id))throw new TicketError("ID inválido.");
  const patch = ticketUpdateDraft(value), db = paymentDatabase();
  const ref = db.collection("tickets").doc(id);
  return db.runTransaction(async tx=>{
    const snap=await tx.get(ref);
    if(!snap.exists)throw new TicketError("Chamado não encontrado.",404);
    tx.update(ref,patch);
    return {...snap.data(),...patch,id} as SupportTicket;
  });
}
