// Core 2.3.30 staging overlay: same public factory name as the original Core.
// Replaces the legacy Math.random nonce. The server must issue and persist
// each one-time nonce before any BDS poll, ACK or NACK. No entrypoint, no grants.
export {createNickBdsTransportChallenge as createNickBdsTransport}
  from "./nick_bds_transport_challenge.js";
