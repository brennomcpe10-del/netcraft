import { compressImageFile } from "../lib/imageUtils.ts";
import React, { useEffect, useState } from "react";
import { useAdmin } from "../context/AdminContext.tsx";
import { useIdentity } from "../context/IdentityContext.tsx";
import {
  defaultIdentity,
  LOGO_LIMITS,
  type SiteIdentity,
} from "../lib/identity.ts";
import { LogoMedia } from "./LogoMedia.tsx";
import { api } from "../lib/api.ts";
export function IdentityManager() {
  const { identity, refresh, publish } = useIdentity(),
    { adminToken } = useAdmin();
  const [draft, setDraft] = useState<SiteIdentity>(identity),
    [token, setToken] = useState<string | null>(null),
    [reset, setReset] = useState(false),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  useEffect(() => {
    if (!dirty) {
      setDraft(identity);
      setToken(null);
      setReset(false);
    }
  }, [identity, dirty]);
  async function upload(file?: File) {
    if (!file || !adminToken) return;
    setError("");
    setMessage("");
    try {
      let mime = file.type === "image/jpg" ? "image/jpeg" : file.type;
      const kind = mime.startsWith("video/")
        ? "video"
        : mime === "image/gif"
          ? "gif"
          : "image";
      if (
        ![
          "image/png",
          "image/jpeg",
          "image/webp",
          "image/svg+xml",
          "image/gif",
          "video/mp4",
          "video/webm",
        ].includes(mime) ||
        file.size >
          (["image/png", "image/jpeg", "image/webp"].includes(mime)
            ? 10 * 1024 * 1024
            : LOGO_LIMITS[kind])
      )
        throw new Error(
          "Use imagens até 1 MB, GIF até 2 MB ou vídeo até 3 MB.",
        );
      setBusy(true);
      let data: string;
      if (["image/png", "image/jpeg", "image/webp"].includes(mime)) {
        // WebP preserves a transparent logo while reducing its persisted size.
        let compressed = await compressImageFile(
          file,
          512,
          512,
          0.82,
          "image/webp",
        );
        if (compressed.length > 226700)
          compressed = await compressImageFile(
            file,
            320,
            320,
            0.65,
            "image/webp",
          );
        const match = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(
          compressed,
        );
        if (!match || match[2].length > 226668)
          throw new Error(
            "Não foi possível reduzir a imagem. Use um arquivo menor.",
          );
        mime = match[1];
        data = match[2];
      } else
        data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () =>
            reject(new Error("Não foi possível ler o arquivo."));
          reader.onload = () => resolve(String(reader.result).split(",")[1]);
          reader.readAsDataURL(file);
        });
      const uploaded = await api.uploadIdentity({ data, mime }, adminToken);
      setDirty(true);
      setDraft((previous) => ({ ...previous, asset: uploaded.asset }));
      setToken(uploaded.uploadToken);
      setReset(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!adminToken) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const saved = await api.saveIdentity(
        { ...draft, uploadToken: token || undefined, reset },
        adminToken,
      );
      publish(saved);
      await refresh();
      setDirty(false);
      setMessage("Identidade visual salva. O cabeçalho foi atualizado.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="identity-manager">
      <h2>Identidade Visual</h2>
      <p>Troque somente o ícone. O nome NETCRAFTBR permanece ao lado.</p>
      <div className="identity-preview">
        <span className="nc-brand">
          <LogoMedia identity={draft} />
          <span>
            NETCRAFT<span className="brand-br">BR</span>
            <small>MINECRAFT BEDROCK</small>
          </span>
        </span>
      </div>
      <p>
        Prévia: mudanças só serão publicadas ao salvar. Com movimento reduzido,
        GIF e vídeo usam o ícone padrão.
      </p>
      <fieldset disabled={busy}>
        <label>
          Enviar ou substituir logo
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif,video/mp4,video/webm"
            onChange={(e) => {
              void upload(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        <p>
          PNG, JPG e WebP até 10 MB, comprimidos antes de salvar; SVG seguro até
          1 MB; GIF até 2 MB; MP4/WebM até 3 MB e 8 segundos. Máximo 2048 × 2048
          px.
        </p>
        <label>
          Enquadramento
          <select
            aria-label="Enquadramento"
            value={draft.fit}
            onChange={(e) => {
              setDirty(true);
              setDraft({
                ...draft,
                fit: e.target.value as "contain" | "cover",
              });
            }}
          >
            <option value="contain">Mostrar inteiro, sem distorcer</option>
            <option value="cover">Preencher e recortar</option>
          </select>
        </label>
        <label>
          Posição horizontal
          <input
            type="range"
            min="0"
            max="100"
            value={draft.x}
            onChange={(e) => {
              setDirty(true);
              setDraft({ ...draft, x: Number(e.target.value) });
            }}
          />
        </label>
        <label>
          Posição vertical
          <input
            type="range"
            min="0"
            max="100"
            value={draft.y}
            onChange={(e) => {
              setDirty(true);
              setDraft({ ...draft, y: Number(e.target.value) });
            }}
          />
        </label>
        <div className="identity-actions">
          <button
            className="text-link"
            onClick={() => {
              setDirty(true);
              setDraft(defaultIdentity);
              setToken(null);
              setReset(true);
            }}
          >
            Remover arquivo / restaurar padrão
          </button>
          <button
            className="text-link"
            onClick={() => {
              setDirty(false);
              setDraft(identity);
              setToken(null);
              setReset(false);
              setError("");
            }}
          >
            Descartar alterações
          </button>
          <button className="nc-button" onClick={save}>
            Salvar identidade visual
          </button>
        </div>
      </fieldset>
      {busy && <p role="status">Validando e salvando…</p>}
      {error && (
        <p role="alert" className="cart-error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="admin-success">
          {message}
        </p>
      )}
    </section>
  );
}
