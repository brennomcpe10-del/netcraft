import type { Product, VIP } from "../../src/types/index.ts";
import type { StoreCategory } from "../../src/lib/storeCategories.ts";
import { paymentDatabase } from "../payments/database.ts";
import { isPreviewEnvironment } from "./previewIsolation.ts";

export type CatalogKind = "products" | "vips";
export type CatalogRecord = (Product | VIP) & { id: string };
type Reader = { get(ref: any): Promise<any> };

export const previewCatalogName = (kind: CatalogKind) =>
  kind === "products" ? "previewProducts" : "previewVips";

// Preview documents are overlays. The original Production documents are NEVER
// rewritten; an override supersedes a base document, and a tombstone hides it.
export function mergeCatalogSnapshots<T extends {id:string}>(
  baseline: T[],
  overrides: ({id:string; __previewDeleted?:boolean} & Partial<T>)[],
): T[] {
  const merged = new Map(baseline.map(item => [item.id,item]));
  for (const item of overrides) {
    if (item.__previewDeleted === true) merged.delete(item.id);
    else {
      const { __previewDeleted: _previewMarker, ...visibleItem } = item;
      merged.set(item.id, { ...(merged.get(item.id) || {} as T), ...visibleItem } as T);
    }
  }
  return [...merged.values()];
}

export function catalogWriteReference(kind: CatalogKind,id:string) {
  return paymentDatabase().collection(
    isPreviewEnvironment() ? previewCatalogName(kind) : kind
  ).doc(id);
}

export async function readCatalogItem(
  kind: CatalogKind, id:string, tx?:Reader, existingDb?:ReturnType<typeof paymentDatabase>,
): Promise<CatalogRecord | null> {
  // Use the transaction's existing database, including isolated in-memory
  // test repositories. Never open a second Firestore connection in a Pix tx.
  const db=existingDb??paymentDatabase();
  const read=(ref:any)=>tx?tx.get(ref):ref.get();
  if (isPreviewEnvironment()) {
    const overlay=await read(db.collection(previewCatalogName(kind)).doc(id));
    if (overlay.exists) {
      if (overlay.data()?.__previewDeleted === true) return null;
      const base=await read(db.collection(kind).doc(id));
      return {...(base.exists ? base.data() : {}),...overlay.data(),id:overlay.id} as CatalogRecord;
    }
  }
  const source=await read(db.collection(kind).doc(id));
  return source.exists ? {...source.data(),id:source.id} as CatalogRecord : null;
}

export function listCatalog(kind:"products"):Promise<Product[]>;
export function listCatalog(kind:"vips"):Promise<VIP[]>;
export async function listCatalog(kind:CatalogKind):Promise<CatalogRecord[]> {
  const db=paymentDatabase();
  const baseline=await db.collection(kind).get();
  const original=baseline.docs.map(d=>({...d.data(),id:d.id} as CatalogRecord));
  if (!isPreviewEnvironment()) return original;
  const overrides=await db.collection(previewCatalogName(kind)).get();
  return mergeCatalogSnapshots(original,overrides.docs.map(d=>
    ({...d.data(),id:d.id} as CatalogRecord & {__previewDeleted?:boolean})
  ));
}

export function previewCategoryReference(){
  return paymentDatabase().collection(isPreviewEnvironment()?"previewStoreSettings":"settings")
    .doc("storeCategories");
}

export async function readStoreCategories():Promise<StoreCategory[]|null> {
  const db=paymentDatabase();
  if(isPreviewEnvironment()){
    const override=await previewCategoryReference().get();
    if(override.exists)return (override.data()?.categories??null) as StoreCategory[]|null;
  }
  const baseline=await db.collection("settings").doc("storeCategories").get();
  return baseline.exists ? (baseline.data()?.categories??null) as StoreCategory[]|null : null;
}
