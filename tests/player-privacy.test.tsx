import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read=(path:string)=>readFileSync(new URL(path,import.meta.url),"utf8");

test("player profiles cannot be silently forged in localStorage or a browser fallback", () => {
 const source=read("../src/context/PlayerContext.tsx");
 assert.match(source,/await api\.loginPlayer\(cleaned\)/);
 assert.match(source,/await api\.getPlayer\(nickname\)/);
 assert.doesNotMatch(source,/getOrCreateUserFromFirestore|getUserByNicknameFromFirestore|saveUserToFirestore/);
 assert.doesNotMatch(source,/Guaranteed fallback session|Backend API login unreachable/);
 assert.match(source,/setPlayer\(null\);/);
});

test("authenticated backend, not browser, manages player and ticket data", () => {
 const api=read("../server/routes/api.ts");
 assert.match(api,/get\('\/tickets', requireAdmin/);
 assert.match(api,/createSupportTicket\(req\.body\)/);
 assert.match(api,/listAdminPlayers\(req\.query\.search\)/);
 assert.match(api,/adminDeletePlayer\(req\.params\.id\)/);
 const admin=read("../src/views/AdminView.tsx");
 assert.match(admin,/api\.getAdminPlayers\(adminToken\)/);
 assert.match(admin,/api\.getTickets\(adminToken\)/);
 assert.doesNotMatch(admin,/deleteUserFromFirestore\(id, extraNickname/);
});

test("future Firebase rules lock down private collections; rules require separate publication", () => {
 const rules=read("../firestore.rules");
 for(const collection of ["users","players","tickets"]){
  const pattern=new RegExp(`match /${collection}/\\{[^}]+\\} \\{([\\s\\S]*?)\\}`);
  const match=rules.match(pattern);
  assert.ok(match,`Rule for ${collection}`);
  assert.match(match[1],/allow read, write: if false;/);
 }
});
