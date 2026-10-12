import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { writeOffs as writeOffsApi } from "../api/ipc-client";

type Api = NonNullable<typeof window.electronAPI>["writeOffs"];
export type WriteOffPage = Awaited<ReturnType<Api["list"]>>;
export type WriteOffSummary = WriteOffPage["rows"][number];
export type WriteOffResponse = Awaited<ReturnType<Api["create"]>>;
export type WriteOffDetail = Extract<WriteOffResponse, { ok: true }>["value"];
export type WriteOffRequest = Parameters<Api["create"]>[0];
export type WriteOffReason = WriteOffRequest["reason"];

export const WRITE_OFF_REASONS: readonly WriteOffReason[] = ["EXPIRY", "DAMAGE", "OTHER"];

/**
 * Write-offs on this terminal (OFFLINE_ONLY store). The list lives here, not in a store: no other
 * screen shows it.
 */
export function useWriteOffs() {
  const { t } = useTranslation();
  const [page, setPage] = useState<WriteOffPage | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (filters?: { search?: string; reason?: WriteOffReason; page?: number }) => {
      setIsLoading(true);
      setError(null);
      try {
        setPage((await writeOffsApi.list(filters)) ?? null);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  /** The refusal in the user's language; the server's English text only as a last resort. */
  const describeFailure = useCallback(
    (response: Extract<WriteOffResponse, { ok: false }>): string => {
      const refusal = response.refusal;
      if (refusal) {
        return t(`writeOffs.errors.${refusal.code}`, {
          product: refusal.product,
          stock: refusal.stock,
          quantity: refusal.quantity,
        });
      }
      return t("writeOffs.errors.generic", { message: response.message });
    },
    [t],
  );

  const create = useCallback(
    async (
      request: WriteOffRequest,
    ): Promise<{ ok: true; doc: WriteOffDetail } | { ok: false; message: string }> => {
      const response = await writeOffsApi.create(request);
      if (!response)
        return {
          ok: false,
          message: t("writeOffs.errors.generic", { message: "IPC unavailable" }),
        };
      if (response.ok) return { ok: true, doc: response.value };
      return { ok: false, message: describeFailure(response) };
    },
    [describeFailure, t],
  );

  const get = useCallback(async (id: string): Promise<WriteOffDetail | null> => {
    const response = await writeOffsApi.get(id);
    return response?.ok ? response.value : null;
  }, []);

  return { page, isLoading, error, load, create, get };
}
