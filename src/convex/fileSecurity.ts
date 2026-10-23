import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { bad } from "./lib";

export const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8 MB
export const ALLOWED_FILE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

/**
 * Não confiar em tamanho/MIME vindos do navegador.
 * Verifica os metadados reais da tabela de sistema do Convex e impede
 * que um storageId registrado em outra unidade seja reutilizado.
 *
 * O Content-Type é uma declaração de upload, não uma inspeção dos bytes:
 * para receber anexos não confiáveis em produção, acrescentar inspeção
 * de assinatura de arquivo em uma action isolada antes de servir conteúdo.
 */
export async function assertUploadedFile(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    storageId: Id<"_storage">;
    size: number;
    mimeType: string;
  },
): Promise<{ size: number; mimeType: string }> {
  // O mock convex-test@0.0.61 não preenche contentType em storage.store.
  // Por isso a validação pura abaixo também é testada com metadados explícitos.
  const registered = await ctx.db
    .query("files")
    .withIndex("by_storage", (q) => q.eq("storageId", args.storageId))
    .first();
  if (registered) {
    if (registered.organizationId !== args.organizationId)
      bad("Este arquivo pertence a outra unidade.");
    bad("Este arquivo já foi registrado.");
  }
  const metadata = await ctx.db.system.get("_storage", args.storageId);
  return validateStoredFileMetadata(metadata, args);
}

/** Regra independente do adaptador de storage para teste determinístico. */
export function validateStoredFileMetadata(
  metadata: { size: number; contentType?: string } | null,
  claimed: { size: number; mimeType: string },
): { size: number; mimeType: string } {
  if (!metadata) bad("Arquivo não encontrado no armazenamento.");
  if (!Number.isSafeInteger(metadata.size) || metadata.size <= 0 || metadata.size > MAX_FILE_BYTES)
    bad(`O arquivo deve ter no máximo ${MAX_FILE_BYTES / 1024 / 1024} MB.`);

  const storedMime = metadata.contentType?.trim().toLowerCase();
  if (!storedMime || !ALLOWED_FILE_MIME_TYPES.includes(storedMime as typeof ALLOWED_FILE_MIME_TYPES[number]))
    bad("Formato real do arquivo não permitido.");
  if (claimed.mimeType.trim().toLowerCase() !== storedMime || claimed.size !== metadata.size)
    bad("Os metadados informados não correspondem ao arquivo enviado.");

  return { size: metadata.size, mimeType: storedMime };
}
