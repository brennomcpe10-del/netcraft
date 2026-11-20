// Pure JavaScript SHA-256 + HMAC for the Bedrock Script API runtime.
// No Node.js crypto, no external network, and no embedded credentials.
// Secret material must be obtained from a trusted server-only runtime configuration.
const encoder = typeof TextEncoder !== "undefined" ? new TextEncoder() : null;
const K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
const rotr = (n, x) => (x >>> n) | (x << (32 - n));
const toBytes = value => {
  if (value instanceof Uint8Array) return value;
  if (!encoder) throw new Error("UTF-8 TextEncoder unavailable");
  return encoder.encode(value);
};
export function sha256(message) {
  const input = toBytes(message), len = input.length, padLen = ((len + 9 + 63) & ~63);
  const padded = new Uint8Array(padLen);
  padded.set(input); padded[len] = 0x80;
  const bits = len * 8, view = new DataView(padded.buffer);
  view.setUint32(padLen - 8, Math.floor(bits / 0x100000000));
  view.setUint32(padLen - 4, bits >>> 0);
  const h = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  const w = new Uint32Array(64);
  for (let offset = 0; offset < padLen; offset += 64) {
    for (let j = 0; j < 16; j++) w[j] = view.getUint32(offset + j * 4);
    for (let j = 16; j < 64; j++) {
      const s0 = rotr(7,w[j-15]) ^ rotr(18,w[j-15]) ^ (w[j-15] >>> 3);
      const s1 = rotr(17,w[j-2]) ^ rotr(19,w[j-2]) ^ (w[j-2] >>> 10);
      w[j] = (w[j-16] + s0 + w[j-7] + s1) >>> 0;
    }
    let [a,b,c,d,e,f,g,q] = h;
    for (let j=0; j<64; j++) {
      const s1=rotr(6,e)^rotr(11,e)^rotr(25,e), choice=(e&f)^(~e&g);
      const t1=(q+s1+choice+K[j]+w[j])>>>0;
      const s0=rotr(2,a)^rotr(13,a)^rotr(22,a), majority=(a&b)^(a&c)^(b&c);
      const t2=(s0+majority)>>>0;
      q=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;
    }
    const vars=[a,b,c,d,e,f,g,q];
    for(let j=0;j<8;j++) h[j]=(h[j]+vars[j])>>>0;
  }
  const out=new Uint8Array(32), v=new DataView(out.buffer);
  for(let j=0;j<8;j++)v.setUint32(j*4,h[j]);
  return out;
}
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");
export function hmacSha256Hex(secret, message) {
  if (typeof secret !== "string" || secret.length < 32 || typeof message !== "string")
    throw new Error("HMAC test key must be supplied by runtime");
  let key=toBytes(secret);
  if(key.length>64)key=sha256(key);
  const ipad=new Uint8Array(64),opad=new Uint8Array(64);
  for(let i=0;i<64;i++){const k=key[i]||0;ipad[i]=k^0x36;opad[i]=k^0x5c;}
  const messageBytes=toBytes(message), inner=new Uint8Array(64+messageBytes.length);
  inner.set(ipad);inner.set(messageBytes,64);
  const digest=sha256(inner),outer=new Uint8Array(96);
  outer.set(opad);outer.set(digest,64);
  return hex(sha256(outer));
}
export function createBedrockTestSigner(readSecret) {
  if(typeof readSecret!=="function")throw new Error("Server-only secret source required");
  return message => {
    const secret=readSecret();
    return hmacSha256Hex(secret,message);
  };
}
