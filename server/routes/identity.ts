import express from "express";
import { requireAdmin } from "../auth/admin.ts";
import { validateLogo } from "../services/logoValidation.ts";
import {
  readIdentity,
  storeLogo,
  saveIdentity,
  signUpload,
  verifyUpload,
} from "../services/identityStore.ts";
export const identityRouter = express.Router();
identityRouter.get("/identity", async (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    res.json(await readIdentity());
  } catch {
    res
      .status(503)
      .json({
        error: "Identidade visual indisponível. O logo padrão será mantido.",
      });
  }
});
identityRouter.post(
  "/admin/identity/upload",
  requireAdmin,
  async (req, res) => {
    let validated;
    try {
      const { data, mime } = req.body || {};
      if (
        typeof data !== "string" ||
        data.length > 4194304 ||
        data.length % 4 !== 0 ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(data) ||
        typeof mime !== "string"
      )
        throw new Error("Arquivo inválido ou maior que 3 MB.");
      validated = await validateLogo(Buffer.from(data, "base64"), mime);
    } catch (error) {
      return res.status(400).json({ error: (error as Error).message });
    }
    try {
      const asset = await storeLogo(validated);
      res.json({ asset, uploadToken: signUpload(asset) });
    } catch (error) {
      res
        .status(503)
        .json({
          error:
            process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
            process.env.GOOGLE_APPLICATION_CREDENTIALS
              ? "Não foi possível gravar o arquivo no Firebase Storage. Confira as permissões de serviço."
              : (error as Error).message,
        });
    }
  },
);
identityRouter.put("/admin/identity", requireAdmin, async (req, res) => {
  try {
    const current = await readIdentity();
    const asset =
      req.body.reset === true
        ? null
        : req.body.uploadToken
          ? verifyUpload(req.body.uploadToken)
          : current.asset;
    res.json(await saveIdentity(asset, req.body));
  } catch {
    res
      .status(400)
      .json({
        error:
          "Não foi possível salvar a identidade. Confira o enquadramento, reenvie arquivos cuja prévia expirou e verifique as credenciais de serviço no backend.",
      });
  }
});
