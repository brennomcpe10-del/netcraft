// Inert preflight only: never authenticates, polls, sends or grants.
import { system } from "@minecraft/server";
import { variables, secrets } from "@minecraft/server-admin";
import { http, HttpRequest, HttpRequestMethod, HttpHeader } from "@minecraft/server-net";
void variables; void secrets; void http; void HttpRequest; void HttpRequestMethod; void HttpHeader;
system.run(() => console.warn("[NetCraft Delivery PRE] modulo de homologacao carregado em modo OFF; nenhuma requisicao enviada."));
