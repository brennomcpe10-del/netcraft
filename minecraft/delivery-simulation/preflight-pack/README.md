# Delivery Homologacao OFF v0.1 — PRE-FLIGHT ONLY

The independently packaged .mcpack from `preflight-pack/` has one script and no reward, payment, player, network, polling, ACK or secret access. The only effect is a console line on startup. It is intentionally NOT the authenticated delivery-client candidate.

Before any MagnoHost activation: back up the world and test on a cloned BDS instance. `@minecraft/server-net` may be unavailable unless the per-module UUID `99ac2e49-b003-46fc-8473-55700984acc7` is separately permitted. Do NOT change global/default permissions, do NOT copy secrets, and do NOT enable any delivery or payment feature.

The authenticated transport code is NOT included. The loopback TLS server remains local; a publicly accessible isolated HTTPS sandbox has NOT been provisioned. No guarantee about secure nonce availability in BDS: secureNonce32 deliberately fails closed when the runtime has no trustworthy `crypto.getRandomValues` equivalent. A header-token prototype does not prove authenticated end-to-end operation without a real test host and runtime.

A later release requires reviewing nonce source, scoped authentication, connectivity, refund safety, idempotency, request leasing/ACK semantics and BDS module compatibility before any active testing.
