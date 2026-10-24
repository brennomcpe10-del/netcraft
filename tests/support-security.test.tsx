import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import express from "express";
import { once } from "node:events";
import { apiRouter } from "../server/routes/api.ts";
import { ticketDraft, ticketUpdateDraft, TicketError } from "../server/services/supportTickets.ts";
import { normalizeNickname, PlayerError } from "../server/services/players.ts";

test("support ticket drafting validates size, category and required text", () => {
 const draft=ticketDraft({nickname:" Halzin5212 ",category:"bug",subject:" Problema ",message:" Não abre "});
 assert.deepEqual(draft,{nickname:"Halzin5212",category:"bug",subject:"Problema",message:"Não abre"});
 assert.throws(()=>ticketDraft({nickname:"Halzin5212",category:"compra",subject:"Oi",message:""}),TicketError);
 assert.throws(()=>ticketDraft({nickname:"Halzin5212",category:"invalido",subject:"Oi",message:"Algo"}),TicketError);
 assert.throws(()=>ticketDraft({nickname:"Halzin5212",category:"bug",subject:"Oi",message:"x".repeat(9000)}),TicketError);
});

test("support status and reply cannot grant permissions or change customer identity", () => {
 assert.equal(ticketUpdateDraft({status:"Resolvido"}).status,"Resolvido");
 assert.equal(ticketUpdateDraft({reply:"Respondido"}).reply,"Respondido");
 assert.throws(()=>ticketUpdateDraft({status:"Pago"}),TicketError);
 assert.throws(()=>ticketUpdateDraft({nickname:"Impostor"}),TicketError);
 assert.throws(()=>ticketUpdateDraft({message:"Substituir texto original"}),TicketError);
});

test("nickname validation does not allow empty control or path identifiers", () => {
 assert.equal(normalizeNickname(" Halzin5212 "),"Halzin5212");
 assert.throws(()=>normalizeNickname("../users"),PlayerError);
 assert.throws(()=>normalizeNickname("x"),PlayerError);
});

test("public ticket history requires an authenticated admin session", async () => {
 const app=express();app.use(express.json());app.use("/api",apiRouter);
 const server=app.listen(0,"127.0.0.1");await once(server,"listening");
 const base=`http://127.0.0.1:${(server.address() as any).port}`;
 try {
  const result=await fetch(base+"/api/tickets?nickname=Halzin5212");
  assert.ok([401,503].includes(result.status));
  const body=await result.json();
  assert.ok(!Array.isArray(body));
 } finally {
  server.closeAllConnections();
  await new Promise<void>(resolve=>server.close(()=>resolve()));
 }
});

test("support FAQ does not promise instant real payment delivery in sandbox", () => {
 const view=readFileSync(new URL("../src/views/SupportView.tsx",import.meta.url),"utf8");
 assert.doesNotMatch(view,/benefícios são concedidos imediatamente/);
 assert.match(view,/Entregas automáticas e cobranças reais ainda não estão habilitadas/);
});
