import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import styled from "styled-components";
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Heading,
  Image as ImageIcon,
  List,
  RefreshCw,
  Text,
  Trash2,
  Upload,
} from "lucide-react";
import { news, type NewsInput } from "../../api/client";
import { ArticleBody } from "../../components/news/ArticleBody";
import type {
  Lang,
  Localized,
  NewsAudience,
  NewsBlock,
  NewsBlockType,
  NewsStatus,
} from "../../components/news/types";

/**
 * Writes one post. The body is a list of blocks, each with its Uzbek and Russian text side by
 * side; the preview underneath renders with the same component readers get.
 */

const BLOCK_TYPES: Array<{
  type: NewsBlockType;
  label: string;
  icon: typeof Text;
}> = [
  { type: "heading", label: "Subtitle", icon: Heading },
  { type: "paragraph", label: "Paragraph", icon: Text },
  { type: "image", label: "Image", icon: ImageIcon },
  { type: "list", label: "List / steps", icon: List },
  { type: "callout", label: "Tip / warning", icon: AlertTriangle },
];

const L = (): Localized => ({ uz: "", ru: "" });

function emptyBlock(type: NewsBlockType): NewsBlock {
  switch (type) {
    case "heading":
      return { type, text: L() };
    case "paragraph":
      return { type, text: L() };
    case "image":
      return { type, url: "", caption: L() };
    case "list":
      return { type, ordered: true, items: L() };
    case "callout":
      return { type, tone: "info", text: L() };
  }
}

interface Draft {
  slug: string;
  titleUz: string;
  titleRu: string;
  excerptUz: string;
  excerptRu: string;
  coverUrl: string;
  audience: NewsAudience;
  status: NewsStatus;
  body: NewsBlock[];
}

const EMPTY: Draft = {
  slug: "",
  titleUz: "",
  titleRu: "",
  excerptUz: "",
  excerptRu: "",
  coverUrl: "",
  audience: "PUBLIC",
  status: "DRAFT",
  body: [],
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const Page = styled.div`
  padding: 32px;
  max-width: 1000px;
  @media (max-width: 700px) {
    padding: 16px;
  }
`;

const Back = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 16px;
  padding: 0;
  border: none;
  background: none;
  font-size: 14px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textSecondary};
  cursor: pointer;
  &:hover {
    color: ${({ theme }) => theme.colors.primary};
  }
`;

const Title = styled.h1`
  margin: 0 0 24px;
  font-size: 28px;
  color: ${({ theme }) => theme.colors.text};
`;

const Card = styled.div`
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 10px;
  padding: 20px;
  background: ${({ theme }) => theme.colors.surface};
  margin-bottom: 20px;
`;

const SectionTitle = styled.h2`
  margin: 0 0 14px;
  font-size: 17px;
  color: ${({ theme }) => theme.colors.text};
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 16px;
  @media (max-width: 700px) {
    grid-template-columns: 1fr;
  }
`;

const Field = styled.div`
  margin-bottom: 14px;
`;

const Label = styled.label`
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-bottom: 6px;
`;

const Hint = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-top: 5px;
`;

const inputCss = `
  width: 100%;
  padding: 10px 12px;
  border-radius: 6px;
  font: inherit;
  font-size: 14px;
  box-sizing: border-box;
`;

const Input = styled.input`
  ${inputCss}
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: transparent;
  color: ${({ theme }) => theme.colors.text};
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary};
  }
`;

const Area = styled.textarea`
  ${inputCss}
  min-height: 84px;
  resize: vertical;
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: transparent;
  color: ${({ theme }) => theme.colors.text};
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary};
  }
`;

const Select = styled.select`
  ${inputCss}
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
`;

const Btn = styled.button<{ $variant?: "primary" | "ghost" }>`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 9px 16px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid
    ${({ theme, $variant }) =>
      $variant === "primary" ? theme.colors.primary : theme.colors.border};
  background: ${({ theme, $variant }) =>
    $variant === "primary" ? theme.colors.primary : "transparent"};
  color: ${({ theme, $variant }) =>
    $variant === "primary" ? "#fff" : theme.colors.text};
  &:hover:not(:disabled) {
    opacity: 0.85;
  }
  &:disabled {
    opacity: 0.4;
    cursor: default;
  }
`;

const Toolbar = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

const CoverPreview = styled.div`
  width: 100%;
  max-width: 360px;
  aspect-ratio: 16 / 9;
  border-radius: 8px;
  overflow: hidden;
  margin-bottom: 10px;
  background: ${({ theme }) => theme.colors.background};
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`;

const BlockCard = styled.div`
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 8px;
  padding: 14px;
  margin-bottom: 12px;
`;

const BlockHead = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  font-size: 13px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textSecondary};

  span {
    flex: 1;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
`;

const SmallBtn = styled.button<{ $danger?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 6px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: transparent;
  color: ${({ theme }) => theme.colors.textSecondary};
  cursor: pointer;
  &:hover:not(:disabled) {
    color: ${({ theme, $danger }) =>
      $danger ? theme.colors.error : theme.colors.primary};
    border-color: ${({ theme, $danger }) =>
      $danger ? theme.colors.error : theme.colors.primary};
  }
  &:disabled {
    opacity: 0.3;
    cursor: default;
  }
`;

const LangTabs = styled.div`
  display: inline-flex;
  gap: 4px;
  margin-bottom: 16px;
`;

const Footer = styled.div`
  position: sticky;
  bottom: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding: 14px 0;
  background: ${({ theme }) => theme.colors.background};
  border-top: 1px solid ${({ theme }) => theme.colors.border};
`;

const ErrorMsg = styled.div`
  color: ${({ theme }) => theme.colors.error};
  font-size: 14px;
  flex-basis: 100%;
`;

const Saved = styled.span`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.success};
`;

// ─── Small pieces ─────────────────────────────────────────────────────────────

/** Uzbek and Russian side by side — the one editing pattern every block uses. */
function Bilingual({
  value,
  onChange,
  multiline,
  placeholder,
}: {
  value: Localized;
  onChange: (v: Localized) => void;
  multiline?: boolean;
  placeholder?: string;
}) {
  const field = (lang: keyof Localized) =>
    multiline ? (
      <Area
        value={value[lang]}
        placeholder={placeholder}
        onChange={(e) => onChange({ ...value, [lang]: e.target.value })}
      />
    ) : (
      <Input
        value={value[lang]}
        placeholder={placeholder}
        onChange={(e) => onChange({ ...value, [lang]: e.target.value })}
      />
    );
  return (
    <Grid>
      <Field>
        <Label>UZ</Label>
        {field("uz")}
      </Field>
      <Field>
        <Label>RU</Label>
        {field("ru")}
      </Field>
    </Grid>
  );
}

function ImagePicker({
  url,
  onChange,
  onError,
}: {
  url: string;
  onChange: (url: string) => void;
  onError: (msg: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      onChange((await news.uploadImage(file)).url);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } }).response
        ?.data?.message;
      onError(msg ?? "Upload failed.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div>
      {url && (
        <CoverPreview>
          <img src={url} alt="" />
        </CoverPreview>
      )}
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        hidden
        onChange={(e) => upload(e.target.files?.[0])}
      />
      <Toolbar>
        <Btn
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          {busy ? <RefreshCw size={15} /> : <Upload size={15} />}
          {url ? "Replace image" : "Upload image"}
        </Btn>
        {url && (
          <Btn type="button" onClick={() => onChange("")}>
            Remove
          </Btn>
        )}
      </Toolbar>
      <Hint>
        JPEG, PNG, WebP or GIF up to 5 MB — saved as WebP, at most 1600px wide.
      </Hint>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function NewsEditorPage() {
  const { id } = useParams();
  const isNew = !id || id === "new";
  const navigate = useNavigate();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [originalSlug, setOriginalSlug] = useState("");
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [previewLang, setPreviewLang] = useState<Lang>("uz");

  useEffect(() => {
    if (isNew) return;
    news
      .adminGet(id)
      .then((p) => {
        setDraft({
          slug: p.slug,
          titleUz: p.titleUz,
          titleRu: p.titleRu,
          excerptUz: p.excerptUz ?? "",
          excerptRu: p.excerptRu ?? "",
          coverUrl: p.coverUrl ?? "",
          audience: p.audience,
          status: p.status,
          body: p.body,
        });
        setOriginalSlug(p.slug);
      })
      .catch(() => setError("Could not load the post."))
      .finally(() => setLoading(false));
  }, [id, isNew]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setSaved(false);
    setDraft((d) => ({ ...d, [key]: value }));
  };

  const setBlock = (i: number, block: NewsBlock) =>
    set(
      "body",
      draft.body.map((b, j) => (j === i ? block : b)),
    );

  const moveBlock = (i: number, dir: -1 | 1) => {
    const body = [...draft.body];
    [body[i], body[i + dir]] = [body[i + dir], body[i]];
    set("body", body);
  };

  const save = async (status: NewsStatus) => {
    setError(null);
    if (!draft.titleUz.trim() || !draft.titleRu.trim()) {
      setError("Both titles are required.");
      return;
    }
    // An image block without an image would be refused by the API; drop it instead.
    const body = draft.body.filter((b) => b.type !== "image" || b.url);
    const input: NewsInput = {
      slug: draft.slug.trim() || undefined,
      titleUz: draft.titleUz,
      titleRu: draft.titleRu,
      excerptUz: draft.excerptUz || null,
      excerptRu: draft.excerptRu || null,
      coverUrl: draft.coverUrl || null,
      body,
      status,
      audience: draft.audience,
    };
    setSaving(true);
    try {
      const post = isNew
        ? await news.create(input)
        : await news.update(id, input);
      setDraft((d) => ({ ...d, slug: post.slug, status, body }));
      setOriginalSlug(post.slug);
      setSaved(true);
      if (isNew) navigate(`/admin/news/${post.id}`, { replace: true });
    } catch (e: unknown) {
      const msg = (
        e as { response?: { data?: { message?: string | string[] } } }
      ).response?.data?.message;
      setError(
        Array.isArray(msg) ? msg.join("; ") : (msg ?? "Could not save."),
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Page>
        <RefreshCw size={16} style={{ animation: "spin 1s linear infinite" }} />
      </Page>
    );
  }

  const published = draft.status === "PUBLISHED";
  const slugChanged =
    !isNew && published && draft.slug.trim() && draft.slug !== originalSlug;

  return (
    <Page>
      <Back type="button" onClick={() => navigate("/admin/news")}>
        <ArrowLeft size={16} />
        All posts
      </Back>
      <Title>{isNew ? "New post" : "Edit post"}</Title>

      <Card>
        <SectionTitle>Card</SectionTitle>
        <Grid>
          <Field>
            <Label>Title (UZ)</Label>
            <Input
              value={draft.titleUz}
              onChange={(e) => set("titleUz", e.target.value)}
            />
          </Field>
          <Field>
            <Label>Title (RU)</Label>
            <Input
              value={draft.titleRu}
              onChange={(e) => set("titleRu", e.target.value)}
            />
          </Field>
          <Field>
            <Label>Short text on the card (UZ)</Label>
            <Area
              value={draft.excerptUz}
              maxLength={500}
              onChange={(e) => set("excerptUz", e.target.value)}
            />
          </Field>
          <Field>
            <Label>Short text on the card (RU)</Label>
            <Area
              value={draft.excerptRu}
              maxLength={500}
              onChange={(e) => set("excerptRu", e.target.value)}
            />
          </Field>
          <Field>
            <Label>Link</Label>
            <Input
              value={draft.slug}
              placeholder="made from the Uzbek title"
              onChange={(e) => set("slug", e.target.value.toLowerCase())}
            />
            <Hint>
              posgro.uz/news/{draft.slug || "…"}
              {slugChanged && " — changing it breaks links already shared."}
            </Hint>
          </Field>
          <Field>
            <Label>Who sees it</Label>
            <Select
              value={draft.audience}
              onChange={(e) => set("audience", e.target.value as NewsAudience)}
            >
              <option value="PUBLIC">
                Everyone — posgro.uz and the dashboard
              </option>
              <option value="CUSTOMERS">Customers only — the dashboard</option>
            </Select>
          </Field>
        </Grid>
        <Label>Main image</Label>
        <ImagePicker
          url={draft.coverUrl}
          onChange={(u) => set("coverUrl", u)}
          onError={setError}
        />
      </Card>

      <Card>
        <SectionTitle>Content</SectionTitle>
        {draft.body.map((block, i) => {
          const meta = BLOCK_TYPES.find((b) => b.type === block.type)!;
          const Icon = meta.icon;
          return (
            <BlockCard key={i}>
              <BlockHead>
                <span>
                  <Icon size={15} />
                  {meta.label}
                </span>
                <SmallBtn
                  type="button"
                  title="Move up"
                  disabled={i === 0}
                  onClick={() => moveBlock(i, -1)}
                >
                  <ArrowUp size={14} />
                </SmallBtn>
                <SmallBtn
                  type="button"
                  title="Move down"
                  disabled={i === draft.body.length - 1}
                  onClick={() => moveBlock(i, 1)}
                >
                  <ArrowDown size={14} />
                </SmallBtn>
                <SmallBtn
                  type="button"
                  title="Remove"
                  $danger
                  onClick={() =>
                    set(
                      "body",
                      draft.body.filter((_, j) => j !== i),
                    )
                  }
                >
                  <Trash2 size={14} />
                </SmallBtn>
              </BlockHead>

              {(block.type === "heading" || block.type === "paragraph") && (
                <Bilingual
                  value={block.text}
                  multiline={block.type === "paragraph"}
                  onChange={(text) => setBlock(i, { ...block, text })}
                />
              )}

              {block.type === "image" && (
                <>
                  <ImagePicker
                    url={block.url}
                    onChange={(url) => setBlock(i, { ...block, url })}
                    onError={setError}
                  />
                  <div style={{ height: 12 }} />
                  <Bilingual
                    value={block.caption ?? L()}
                    placeholder="Caption (optional)"
                    onChange={(caption) => setBlock(i, { ...block, caption })}
                  />
                </>
              )}

              {block.type === "list" && (
                <>
                  <Field>
                    <Select
                      value={block.ordered ? "ordered" : "bullets"}
                      onChange={(e) =>
                        setBlock(i, {
                          ...block,
                          ordered: e.target.value === "ordered",
                        })
                      }
                    >
                      <option value="ordered">Numbered steps (1, 2, 3)</option>
                      <option value="bullets">Bullet points</option>
                    </Select>
                  </Field>
                  <Bilingual
                    value={block.items}
                    multiline
                    placeholder="One item per line"
                    onChange={(items) => setBlock(i, { ...block, items })}
                  />
                </>
              )}

              {block.type === "callout" && (
                <>
                  <Field>
                    <Select
                      value={block.tone}
                      onChange={(e) =>
                        setBlock(i, {
                          ...block,
                          tone: e.target.value as "info" | "warning",
                        })
                      }
                    >
                      <option value="info">Tip (blue)</option>
                      <option value="warning">Warning (orange)</option>
                    </Select>
                  </Field>
                  <Bilingual
                    value={block.text}
                    multiline
                    onChange={(text) => setBlock(i, { ...block, text })}
                  />
                </>
              )}
            </BlockCard>
          );
        })}

        <Label>Add</Label>
        <Toolbar>
          {BLOCK_TYPES.map(({ type, label, icon: Icon }) => (
            <Btn
              key={type}
              type="button"
              onClick={() => set("body", [...draft.body, emptyBlock(type)])}
            >
              <Icon size={15} />
              {label}
            </Btn>
          ))}
        </Toolbar>
      </Card>

      <Card>
        <SectionTitle>Preview</SectionTitle>
        <LangTabs>
          {(["uz", "ru"] as const).map((l) => (
            <Btn
              key={l}
              type="button"
              $variant={previewLang === l ? "primary" : "ghost"}
              onClick={() => setPreviewLang(l)}
            >
              {l.toUpperCase()}
            </Btn>
          ))}
        </LangTabs>
        <h1 style={{ margin: "0 0 16px", fontSize: 26 }}>
          {(previewLang === "uz" ? draft.titleUz : draft.titleRu) || "—"}
        </h1>
        {draft.coverUrl && (
          <img
            src={draft.coverUrl}
            alt=""
            style={{ width: "100%", borderRadius: 12, marginBottom: 20 }}
          />
        )}
        <ArticleBody
          blocks={draft.body.filter((b) => b.type !== "image" || b.url)}
          lang={previewLang}
          closeLabel="Close"
        />
      </Card>

      <Footer>
        {error && <ErrorMsg>{error}</ErrorMsg>}
        <Btn type="button" disabled={saving} onClick={() => save("DRAFT")}>
          {published ? "Unpublish (save as draft)" : "Save draft"}
        </Btn>
        <Btn
          type="button"
          $variant="primary"
          disabled={saving}
          onClick={() => save("PUBLISHED")}
        >
          {published ? "Save" : "Publish"}
        </Btn>
        {saved && <Saved>Saved{published ? " — live" : " as draft"}</Saved>}
      </Footer>
    </Page>
  );
}
