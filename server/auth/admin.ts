import crypto from "node:crypto";
import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";

// Read at request time: dotenv is loaded after ESM imports in the local server.
const secret = () => process.env.ADMIN_KEYWORD || "";
const revoked = new Map<string, number>();
const MAX_AGE = 30 * 24 * 60 * 60 * 1000;
export function generateAdminToken(): string {
  const key = secret();
  if (!key) throw new Error("Segredo administrativo não configurado.");
  const payload = `${Date.now()}.${crypto.randomBytes(16).toString("hex")}`;
  return `adm_${payload}.${crypto.createHmac("sha256", key).update(payload).digest("hex")}`;
}
export function isValidAdminToken(token: unknown): boolean {
  const key = secret();
  if (!key || typeof token !== "string" || revoked.has(token)) return false;
  const match = /^adm_(\d{13})\.([a-f0-9]{32})\.([a-f0-9]{64})$/.exec(token);
  if (!match) return false;
  const timestamp = Number(match[1]);
  if (
    Date.now() - timestamp > MAX_AGE ||
    timestamp > Date.now() + 5 * 60 * 1000
  )
    return false;
  const expected = crypto
    .createHmac("sha256", key)
    .update(`${match[1]}.${match[2]}`)
    .digest();
  return crypto.timingSafeEqual(Buffer.from(match[3], "hex"), expected);
}
function tokenFrom(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7);
  const legacy = req.headers["x-admin-token"];
  return typeof legacy === "string" ? legacy : undefined;
}
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  res.setHeader("Cache-Control", "no-store");
  if (!secret())
    return res
      .status(503)
      .json({
        code: "ADMIN_NOT_CONFIGURED",
        error:
          "Acesso administrativo indisponível. Configure ADMIN_KEYWORD no backend deste ambiente e refaça o deploy.",
      });
  const token = tokenFrom(req);
  if (!token)
    return res
      .status(401)
      .json({ error: "Acesso negado: Credencial de administrador ausente." });
  if (!isValidAdminToken(token))
    return res
      .status(403)
      .json({ error: "Sessão administrativa inválida ou expirada." });
  next();
}
export const adminAuthRouter = express.Router();
adminAuthRouter.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});
adminAuthRouter.post("/login", (req, res) => {
  const key = secret();
  if (!key)
    return res
      .status(503)
      .json({
        code: "ADMIN_NOT_CONFIGURED",
        error:
          "Acesso administrativo indisponível. Configure ADMIN_KEYWORD no backend deste ambiente e refaça o deploy.",
      });
  const password = req.body?.password;
  if (typeof password !== "string" || !password)
    return res.status(400).json({ error: "Informe a senha administrativa." });
  // Hash both inputs before constant-time comparison; never accept a raw password as a bearer token.
  const hash = (value: string) =>
    crypto.createHash("sha256").update(value).digest();
  if (!crypto.timingSafeEqual(hash(password), hash(key)))
    return res.status(401).json({ error: "Senha administrativa incorreta." });
  return res.json({ success: true, token: generateAdminToken() });
});
adminAuthRouter.get("/verify", (req, res) => {
  if (!secret())
    return res
      .status(503)
      .json({
        code: "ADMIN_NOT_CONFIGURED",
        error:
          "Acesso administrativo indisponível. Configure ADMIN_KEYWORD no backend deste ambiente e refaça o deploy.",
      });
  return res.json({ authenticated: isValidAdminToken(tokenFrom(req)) });
});
adminAuthRouter.post("/logout", (req, res) => {
  const now = Date.now();
  for (const [token, time] of revoked)
    if (now - time > MAX_AGE) revoked.delete(token);
  const token = tokenFrom(req);
  if (token && isValidAdminToken(token)) revoked.set(token, now);
  res.json({ success: true });
});
