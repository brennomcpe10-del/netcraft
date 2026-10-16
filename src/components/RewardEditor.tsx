import React from "react";
import { RewardDraft } from "../types/index.ts";
import coreItems from "../data/core-item-identifiers.json";
export { validateRewardDraft } from "../lib/rewardDraft.ts";
export function RewardEditor({
  value,
  onChange,
}: {
  value?: RewardDraft;
  onChange: (value: RewardDraft) => void;
}) {
  const items = value?.items || [];
  const update = (index: number, patch: Partial<(typeof items)[number]>) =>
    onChange({
      version: 1,
      items: items.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    });
  return (
    <fieldset className="reward-editor">
      <legend>Recompensa do produto</legend>
      <p>
        Configure os itens do kit ou pacote. Este cadastro é um rascunho: a
        entrega automática ainda não está ativa.
      </p>
      <datalist id="core-item-ids">
        {coreItems.identifiers.map((id) => (
          <option key={id} value={id} />
        ))}
      </datalist>
      {items.map((row, i) => (
        <div className="reward-row" key={i}>
          <label>
            Item Bedrock
            <input
              list="core-item-ids"
              value={row.itemId}
              onChange={(e) => update(i, { itemId: e.target.value.trim() })}
              placeholder="minecraft:diamond"
              required
            />
          </label>
          <label>
            Quantidade
            <input
              type="number"
              min={1}
              max={2304}
              step={1}
              required
              value={row.quantity}
              onChange={(e) => update(i, { quantity: Number(e.target.value) })}
            />
          </label>
          <button
            type="button"
            aria-label={`Remover item ${i + 1}`}
            onClick={() =>
              onChange({
                version: 1,
                items: items.filter((_, index) => index !== i),
              })
            }
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        disabled={items.length >= 128}
        className="nc-button secondary"
        onClick={() =>
          onChange({
            version: 1,
            items: [...items, { itemId: "", quantity: 1 }],
          })
        }
      >
        Adicionar item
      </button>
      <details>
        <summary>Sobre os identificadores personalizados</summary>
        <p>
          As sugestões foram extraídas do Bloco 2 anexado. A presença no arquivo
          não confirma disponibilidade no servidor: confirme os packs ativos e
          teste a entrega em mundo separado. Não cadastre comandos.
        </p>
      </details>
    </fieldset>
  );
}
