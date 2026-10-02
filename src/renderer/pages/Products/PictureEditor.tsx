import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { Button } from "../../components/common/Button";
import { Picture } from "../../components/common/Picture";
import { useToast } from "../../context/ToastContext";
import { images, type ImageOwner } from "../../api/ipc-client";
import { usePictureStore } from "../../store/picture-store";
import { encodePicture } from "../../utils/pictures";

const Layout = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.md};
`;

const Side = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const Hint = styled.p`
  margin: 0;
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

interface PictureEditorProps {
  owner: ImageOwner;
  /** The product's barcode or the category's nameUz — what the picture is stored under. */
  ownerKey: string;
  /** The posimg: URL showing what the POS shows now (own picture, or the fallback). */
  previewUrl: string;
}

/**
 * Set or remove an admin's own picture for a product or category, on this till only. Without one,
 * the POS falls back to the MXIK / pre-filled picture — the preview shows whichever applies.
 *
 * POS-only (it talks to the till over IPC), so it lives here and not in components/common, which
 * the web dashboard compiles too.
 */
export function PictureEditor({ owner, ownerKey, previewUrl }: PictureEditorProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const ownVersion = usePictureStore((s) => s.ownVersion);
  const ownChanged = usePictureStore((s) => s.ownChanged);
  const [hasOwn, setHasOwn] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    images
      .hasOwn(owner, ownerKey)
      ?.then((has) => alive && setHasOwn(has))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [owner, ownerKey, ownVersion]);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      ownChanged();
    } catch (error) {
      console.error("[pictures] edit failed:", error);
      toast.error(t("pictures.saveFailed"));
    } finally {
      setBusy(false);
    }
  };

  const onFile = (file: File | undefined) => {
    if (!file) return;
    void run(async () => images.setOwn(owner, ownerKey, await encodePicture(file)));
  };

  return (
    <Layout>
      <Picture src={`${previewUrl}&own=${ownVersion}`} size={128} />
      <Side>
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          hidden
          onChange={(e) => {
            onFile(e.target.files?.[0]);
            e.target.value = ""; // the same file again must still fire onChange
          }}
        />
        <Button
          type="button"
          size="small"
          disabled={busy}
          onClick={() => fileInput.current?.click()}
        >
          {t("pictures.upload")}
        </Button>
        {hasOwn && (
          <Button
            type="button"
            size="small"
            variant="secondary"
            disabled={busy}
            onClick={() => void run(() => images.removeOwn(owner, ownerKey) ?? Promise.resolve())}
          >
            {t("pictures.remove")}
          </Button>
        )}
        <Hint>{t("pictures.hint")}</Hint>
      </Side>
    </Layout>
  );
}
