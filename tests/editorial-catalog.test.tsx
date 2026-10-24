import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeEditorial, EditorialError } from "../server/services/editorialCatalog.ts";

test("editorial content validates published events before persistence", () => {
  const event=normalizeEditorial("events",{
    name:"  Torneio Bedrock ",description:" Arena especial ",date:"2026-11-02",
    rewards:["Espada"],published:false
  });
  assert.equal(event.name,"Torneio Bedrock");
  assert.equal(event.published,false);
  assert.deepEqual(event.rewards,["Espada"]);
  assert.throws(()=>normalizeEditorial("events",{name:"Evento",description:"",date:"2026-11-02"}),EditorialError);
});

test("news preserves publication state and blocks empty content", () => {
  const article=normalizeEditorial("news",{title:"Atualização",content:"Novidades",published:false,category:"Novidade"});
  assert.equal(article.published,false);
  assert.equal(article.category,"Novidade");
  assert.throws(()=>normalizeEditorial("news",{title:"",content:"Notícia"}),EditorialError);
});

test("community links require HTTPS and preserve ordering", () => {
  const link=normalizeEditorial("community",{name:"Discord",url:"https://discord.com/invite/test",order:3,active:false,platform:"discord"});
  assert.equal(link.order,3);
  assert.equal(link.active,false);
  assert.throws(()=>normalizeEditorial("community",{name:"Discord",url:"javascript:alert(1)"}),EditorialError);
  assert.throws(()=>normalizeEditorial("community",{name:"Discord",url:"http://example.org"}),EditorialError);
});
