import React, { useEffect, useRef, useState } from "react";
import styled from "styled-components";
import { siteConfig, type LoginBanner } from "../../api/client";

// ─── Styled Components ────────────────────────────────────────────────────────

const Page = styled.div`
  padding: 32px;
  max-width: 1100px;
  display: flex;
  flex-direction: column;
  gap: 28px;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const Title = styled.h1`
  margin: 0;
  font-size: 28px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text};
`;

const Body = styled.div`
  display: flex;
  gap: 32px;
  align-items: flex-start;

  @media (max-width: 900px) {
    flex-direction: column;
  }
`;

const FormCard = styled.div`
  flex: 1;
  background: ${({ theme }) => theme.colors.surface};
  border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  padding: 28px;
  display: flex;
  flex-direction: column;
  gap: 20px;
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const Label = styled.label`
  font-size: 14px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const TextInput = styled.input`
  padding: 10px 14px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 8px;
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.text};
  font-size: 15px;
  width: 100%;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary};
  }
`;

const Hint = styled.p`
  margin: 0;
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const UploadArea = styled.div<{ $hasImage: boolean }>`
  border: 2px dashed ${({ $hasImage, theme }) => $hasImage ? theme.colors.primary : theme.colors.border};
  border-radius: 8px;
  overflow: hidden;
  background: ${({ theme }) => theme.colors.background};
  cursor: pointer;
  transition: border-color 0.2s;
  &:hover { border-color: ${({ theme }) => theme.colors.primary}; }
`;

const UploadThumb = styled.img`
  width: 100%;
  height: 160px;
  object-fit: cover;
  display: block;
`;

const UploadEmpty = styled.div`
  height: 120px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 14px;
`;

const UploadActions = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 8px 12px;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
`;

const UploadBtn = styled.button`
  padding: 6px 14px;
  border-radius: 6px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  font-size: 13px;
  cursor: pointer;
  &:hover { background: ${({ theme }) => theme.colors.background}; }
`;

const RemoveBtn = styled(UploadBtn)`
  color: ${({ theme }) => theme.colors.error};
  border-color: ${({ theme }) => theme.colors.error};
`;

const UploadFileName = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
`;

const SaveBtn = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 24px;
  border-radius: 8px;
  border: none;
  background: ${({ theme }) => theme.colors.primary};
  color: #fff;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  align-self: flex-start;
  transition: opacity 0.2s;

  &:hover { opacity: 0.85; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const StatusMsg = styled.span<{ $ok?: boolean }>`
  font-size: 14px;
  color: ${({ $ok, theme }) => $ok ? theme.colors.success ?? "#16a34a" : theme.colors.error};
`;

const PreviewCard = styled.div`
  width: 340px;
  min-width: 280px;
  border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  overflow: hidden;
  background: ${({ theme }) => theme.colors.surface};

  @media (max-width: 900px) {
    width: 100%;
  }
`;

const PreviewLabel = styled.div`
  padding: 12px 16px;
  font-size: 13px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textSecondary};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const PreviewPanel = styled.div<{ $imageUrl?: string }>`
  height: 320px;
  background: ${({ $imageUrl }) =>
    $imageUrl
      ? `url(${JSON.stringify($imageUrl)}) center / cover no-repeat`
      : "linear-gradient(135deg, #1976d2 0%, #dc004e 100%)"};
  position: relative;
  display: flex;
  align-items: flex-end;
`;

const PreviewOverlay = styled.div`
  width: 100%;
  padding: 20px;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.6) 0%, transparent 100%);
`;

const PreviewTitle = styled.div`
  font-size: 18px;
  font-weight: 700;
  color: #fff;
  margin-bottom: 4px;
`;

const PreviewSubtitle = styled.div`
  font-size: 13px;
  color: rgba(255, 255, 255, 0.85);
`;

const PreviewEmpty = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.5);
  font-size: 14px;
`;

// ─── Component ────────────────────────────────────────────────────────────────

export function LoginBannerPage() {
  const [form, setForm] = useState<LoginBanner>({ imageUrl: "", title: "", subtitle: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    siteConfig.getLoginBanner()
      .then((b) => { setForm(b); setPreviewUrl(b.imageUrl); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleRemoveImage = () => {
    setPendingFile(null);
    setPreviewUrl("");
    setForm((prev) => ({ ...prev, imageUrl: "" }));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSave = async () => {
    setSaving(true);
    setStatus(null);
    try {
      let imageUrl = form.imageUrl;
      if (pendingFile) {
        const { url } = await siteConfig.uploadImage(pendingFile);
        imageUrl = url;
        setPendingFile(null);
      }
      const updated = { ...form, imageUrl };
      await siteConfig.updateLoginBanner(updated);
      setForm(updated);
      setStatus({ ok: true, msg: "Saved successfully" });
    } catch {
      setStatus({ ok: false, msg: "Failed to save" });
    } finally {
      setSaving(false);
    }
  };

  const set = (key: keyof LoginBanner) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const hasOverlay = form.title || form.subtitle;

  return (
    <Page>
      <Header>
        <Title>Login Page Banner</Title>
      </Header>

      <Body>
        <FormCard>
          <Field>
            <Label>Banner Image</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              style={{ display: "none" }}
              onChange={handleFileChange}
            />
            <UploadArea $hasImage={!!previewUrl} onClick={() => fileInputRef.current?.click()}>
              {previewUrl
                ? <UploadThumb src={previewUrl} alt="Banner preview" onClick={(e) => e.stopPropagation()} />
                : <UploadEmpty>
                    <span style={{ fontSize: 28 }}>🖼️</span>
                    <span>Click to choose an image</span>
                  </UploadEmpty>
              }
              <UploadActions onClick={(e) => e.stopPropagation()}>
                <UploadBtn onClick={() => fileInputRef.current?.click()} disabled={loading}>
                  {previewUrl ? "Change" : "Upload"}
                </UploadBtn>
                {previewUrl && (
                  <RemoveBtn onClick={handleRemoveImage}>Remove</RemoveBtn>
                )}
                <UploadFileName>
                  {pendingFile ? pendingFile.name : form.imageUrl ? form.imageUrl.split("/").pop() : "No image selected"}
                </UploadFileName>
              </UploadActions>
            </UploadArea>
            <Hint>JPEG, PNG, GIF or WebP · max 5 MB. Leave empty to use the default gradient.</Hint>
          </Field>

          <Field>
            <Label>Title</Label>
            <TextInput
              placeholder="Welcome to POSGRO"
              value={form.title}
              onChange={set("title")}
              disabled={loading}
            />
          </Field>

          <Field>
            <Label>Subtitle</Label>
            <TextInput
              placeholder="Smart Retail Solution"
              value={form.subtitle}
              onChange={set("subtitle")}
              disabled={loading}
            />
          </Field>

          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <SaveBtn onClick={handleSave} disabled={saving || loading}>
              {saving ? "Saving…" : "Save"}
            </SaveBtn>
            {status && <StatusMsg $ok={status.ok}>{status.msg}</StatusMsg>}
          </div>
        </FormCard>

        <PreviewCard>
          <PreviewLabel>Preview</PreviewLabel>
          <PreviewPanel $imageUrl={previewUrl || undefined}>
            {!hasOverlay && !previewUrl && (
              <PreviewEmpty>Default gradient</PreviewEmpty>
            )}
            {hasOverlay && (
              <PreviewOverlay>
                {form.title && <PreviewTitle>{form.title}</PreviewTitle>}
                {form.subtitle && <PreviewSubtitle>{form.subtitle}</PreviewSubtitle>}
              </PreviewOverlay>
            )}
          </PreviewPanel>
        </PreviewCard>
      </Body>
    </Page>
  );
}
