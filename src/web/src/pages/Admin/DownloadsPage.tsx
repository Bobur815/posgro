import React, { useEffect, useRef, useState } from "react";
import styled from "styled-components";
import { RefreshCw, Upload, Trash2, Eye, EyeOff, ExternalLink } from "lucide-react";
import { downloads, type DownloadItem, type LatestApp } from "../../api/client";

/**
 * Manages what panel.posgro.uz offers: printer drivers, scale utilities, manuals.
 *
 * The POSGRO installer is NOT managed here. It is read from /releases/latest.yml — the same feed
 * every terminal's updater polls — and shown read-only at the top, so the portal can never
 * advertise a build the updater would refuse. Publishing an installer stays `npm run deploy:pos`.
 */

const CATEGORIES = ["DRIVER", "TOOL", "MANUAL", "OTHER"] as const;

const CATEGORY_LABEL: Record<string, string> = {
  DRIVER: "Drivers",
  TOOL: "Tools",
  MANUAL: "Manuals",
  OTHER: "Other",
};

const Page = styled.div`
  padding: 32px;
  max-width: 1000px;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
`;

const Title = styled.h1`
  margin: 0;
  font-size: 28px;
  color: ${({ theme }) => theme.colors.text};
`;

const Subtitle = styled.p`
  margin: 6px 0 0;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const Card = styled.div`
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 10px;
  padding: 20px;
  background: ${({ theme }) => theme.colors.surface};
  margin-bottom: 20px;
`;

const AppCard = styled(Card)`
  display: flex;
  align-items: center;
  gap: 16px;
  border-left: 4px solid ${({ theme }) => theme.colors.primary};
`;

const Label = styled.label`
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-bottom: 6px;
`;

const Input = styled.input`
  width: 100%;
  padding: 10px 12px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 6px;
  font-size: 15px;
  background: transparent;
  color: ${({ theme }) => theme.colors.text};
  box-sizing: border-box;
  &:focus { outline: none; border-color: ${({ theme }) => theme.colors.primary}; }
`;

const Select = styled.select`
  width: 100%;
  padding: 10px 12px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 6px;
  font-size: 15px;
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  box-sizing: border-box;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0 16px;
  @media (max-width: 700px) { grid-template-columns: 1fr; }
`;

const Field = styled.div`
  margin-bottom: 16px;
`;

const FieldHint = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-top: 6px;
`;

const Btn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  background: ${({ theme }) => theme.colors.primary};
  color: #fff;
  &:hover { opacity: 0.85; }
  &:disabled { opacity: 0.4; cursor: default; }
`;

const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  &:last-child { border-bottom: none; }
`;

const RowMain = styled.div`
  flex: 1;
  min-width: 0;
`;

const RowTitle = styled.div<{ $muted?: boolean }>`
  font-weight: 600;
  font-size: 15px;
  color: ${({ theme, $muted }) => ($muted ? theme.colors.textSecondary : theme.colors.text)};
`;

const RowMeta = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-top: 3px;
  word-break: break-all;
`;

const IconBtn = styled.button<{ $danger?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 6px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: transparent;
  color: ${({ theme }) => theme.colors.textSecondary};
  cursor: pointer;
  &:hover {
    color: ${({ theme, $danger }) => ($danger ? theme.colors.error : theme.colors.primary)};
    border-color: ${({ theme, $danger }) => ($danger ? theme.colors.error : theme.colors.primary)};
  }
`;

const Bar = styled.div`
  height: 6px;
  border-radius: 3px;
  background: ${({ theme }) => theme.colors.border};
  overflow: hidden;
  margin-top: 10px;
`;

const Fill = styled.div<{ $pct: number }>`
  height: 100%;
  width: ${({ $pct }) => $pct}%;
  background: ${({ theme }) => theme.colors.primary};
  transition: width 0.2s ease;
`;

const ErrorMsg = styled.div`
  color: ${({ theme }) => theme.colors.error};
  font-size: 14px;
  margin-top: 12px;
`;

const SectionTitle = styled.h2`
  margin: 32px 0 8px;
  font-size: 18px;
  color: ${({ theme }) => theme.colors.text};
`;

function formatSize(bytes: number | null): string {
  if (!bytes || bytes <= 0) return "";
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
}

const EMPTY_META = {
  titleUz: "",
  titleRu: "",
  descUz: "",
  descRu: "",
  category: "DRIVER",
  version: "",
  slug: "",
};

export function DownloadsPage() {
  const [items, setItems] = useState<DownloadItem[]>([]);
  const [app, setApp] = useState<LatestApp | null>(null);
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState({ ...EMPTY_META });
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const reload = () =>
    downloads
      .listAll()
      .then(setItems)
      .catch(() => {});

  useEffect(() => {
    Promise.all([
      downloads.listAll().then(setItems),
      downloads.latestApp().then(setApp),
    ])
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleUpload = async () => {
    if (!file) return;
    setError(null);
    setProgress(0);
    try {
      await downloads.create(file, meta, setProgress);
      setMeta({ ...EMPTY_META });
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
      await reload();
    } catch (e: any) {
      setError(e?.response?.data?.message ?? (e as Error).message);
    } finally {
      setProgress(null);
    }
  };

  const togglePublished = async (item: DownloadItem) => {
    await downloads.update(item.id, { published: !item.published });
    await reload();
  };

  const remove = async (item: DownloadItem) => {
    // The file is deleted from disk too, so a stale card on the portal cannot outlive it.
    if (!window.confirm(`Delete “${item.titleUz || item.slug}” and its file?`)) return;
    await downloads.remove(item.id);
    await reload();
  };

  const canUpload = Boolean(file && meta.titleUz && meta.titleRu);

  return (
    <Page>
      <Header>
        <div>
          <Title>Downloads</Title>
          <Subtitle>Files offered on panel.posgro.uz.</Subtitle>
        </div>
        <a href="https://panel.posgro.uz" target="_blank" rel="noreferrer">
          <IconBtn title="Open the portal">
            <ExternalLink size={16} />
          </IconBtn>
        </a>
      </Header>

      {loading ? (
        <div style={{ display: "flex", gap: 8, color: "#6b7280" }}>
          <RefreshCw size={16} style={{ animation: "spin 1s linear infinite" }} />
          Loading…
        </div>
      ) : (
        <>
          <AppCard>
            <div style={{ flex: 1 }}>
              <RowTitle>POSGRO installer</RowTitle>
              <RowMeta>
                {app
                  ? `v${app.version}${formatSize(app.size) ? ` · ${formatSize(app.size)}` : ""} · ${app.url}`
                  : "No release feed found — the portal will hide the download button."}
              </RowMeta>
              <FieldHint>
                Read from /releases/latest.yml, the same feed the terminals’ updater polls. Publish
                a new one with <code>npm run deploy:pos</code>; it cannot be uploaded here, because
                two sources for one installer is how a shop gets a build the updater refuses.
              </FieldHint>
            </div>
          </AppCard>

          <SectionTitle>Upload a file</SectionTitle>
          <Card>
            <Field>
              <Label>File</Label>
              <Input
                ref={fileInput}
                type="file"
                accept=".exe,.msi,.zip,.rar,.7z,.pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <FieldHint>
                exe, msi, zip, rar, 7z or pdf — up to 512 MB. {file && `Selected: ${formatSize(file.size)}`}
              </FieldHint>
            </Field>

            <Grid>
              <Field>
                <Label>Title (UZ)</Label>
                <Input
                  value={meta.titleUz}
                  onChange={(e) => setMeta({ ...meta, titleUz: e.target.value })}
                />
              </Field>
              <Field>
                <Label>Title (RU)</Label>
                <Input
                  value={meta.titleRu}
                  onChange={(e) => setMeta({ ...meta, titleRu: e.target.value })}
                />
              </Field>
              <Field>
                <Label>Description (UZ)</Label>
                <Input
                  value={meta.descUz}
                  onChange={(e) => setMeta({ ...meta, descUz: e.target.value })}
                />
              </Field>
              <Field>
                <Label>Description (RU)</Label>
                <Input
                  value={meta.descRu}
                  onChange={(e) => setMeta({ ...meta, descRu: e.target.value })}
                />
              </Field>
              <Field>
                <Label>Category</Label>
                <Select
                  value={meta.category}
                  onChange={(e) => setMeta({ ...meta, category: e.target.value })}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABEL[c]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field>
                <Label>Version (optional)</Label>
                <Input
                  placeholder="3.2"
                  value={meta.version}
                  onChange={(e) => setMeta({ ...meta, version: e.target.value })}
                />
              </Field>
            </Grid>

            <Btn onClick={handleUpload} disabled={!canUpload || progress !== null}>
              <Upload size={16} />
              {progress !== null ? `Uploading… ${progress}%` : "Upload"}
            </Btn>
            {progress !== null && (
              <Bar>
                <Fill $pct={progress} />
              </Bar>
            )}
            {error && <ErrorMsg>{error}</ErrorMsg>}
          </Card>

          <SectionTitle>Files ({items.length})</SectionTitle>
          <Card>
            {items.length === 0 ? (
              <div style={{ color: "#6b7280", fontSize: 14 }}>
                Nothing uploaded yet. The portal shows only the installer until something is added.
              </div>
            ) : (
              items.map((item) => (
                <Row key={item.id}>
                  <RowMain>
                    <RowTitle $muted={!item.published}>
                      {item.titleUz || item.slug}
                      {!item.published && " · hidden"}
                    </RowTitle>
                    <RowMeta>
                      {CATEGORY_LABEL[item.category] ?? item.category}
                      {item.version && ` · v${item.version}`}
                      {` · ${formatSize(item.fileSize)}`}
                      {` · ${item.downloads} downloads`}
                      {` · ${item.filePath}`}
                    </RowMeta>
                  </RowMain>
                  <IconBtn
                    title={item.published ? "Hide from the portal" : "Show on the portal"}
                    onClick={() => togglePublished(item)}
                  >
                    {item.published ? <Eye size={16} /> : <EyeOff size={16} />}
                  </IconBtn>
                  <IconBtn $danger title="Delete" onClick={() => remove(item)}>
                    <Trash2 size={16} />
                  </IconBtn>
                </Row>
              ))
            )}
          </Card>
        </>
      )}
    </Page>
  );
}
