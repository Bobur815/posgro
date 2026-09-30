import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import styled from "styled-components";
import { Eye, EyeOff, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { news } from "../../api/client";
import type { NewsAdminRow } from "../../components/news/types";

/**
 * Posts for posgro.uz/news and the dashboard's news button. Readers only see published posts —
 * and only once NEWS_ENABLED=true on the API — so drafts can be prepared safely here.
 */

const Page = styled.div`
  padding: 32px;
  max-width: 1000px;
  @media (max-width: 700px) {
    padding: 16px;
  }
`;

const Header = styled.div`
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
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

const Btn = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 18px;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 600;
  text-decoration: none;
  background: ${({ theme }) => theme.colors.primary};
  color: #fff;
  &:hover {
    opacity: 0.85;
  }
`;

const Card = styled.div`
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 10px;
  padding: 4px 20px;
  background: ${({ theme }) => theme.colors.surface};
`;

const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  &:last-child {
    border-bottom: none;
  }
`;

const Thumb = styled.div`
  flex: 0 0 auto;
  width: 96px;
  aspect-ratio: 16 / 9;
  border-radius: 6px;
  overflow: hidden;
  background: ${({ theme }) => theme.colors.background};
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  @media (max-width: 600px) {
    display: none;
  }
`;

const Main = styled.div`
  flex: 1;
  min-width: 0;
`;

const RowTitle = styled.div`
  font-weight: 600;
  font-size: 15px;
  color: ${({ theme }) => theme.colors.text};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Meta = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-top: 4px;
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const Badge = styled.span<{ $tone: "ok" | "muted" | "info" }>`
  padding: 2px 8px;
  border-radius: 999px;
  font-weight: 600;
  color: #fff;
  background: ${({ theme, $tone }) =>
    $tone === "ok"
      ? theme.colors.success
      : $tone === "info"
        ? theme.colors.info
        : theme.colors.textSecondary};
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
    color: ${({ theme, $danger }) =>
      $danger ? theme.colors.error : theme.colors.primary};
    border-color: ${({ theme, $danger }) =>
      $danger ? theme.colors.error : theme.colors.primary};
  }
`;

const Empty = styled.div`
  padding: 32px 0;
  text-align: center;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const ErrorMsg = styled.div`
  color: ${({ theme }) => theme.colors.error};
  font-size: 14px;
  margin-bottom: 12px;
`;

export function NewsAdminPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<NewsAdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = () =>
    news
      .adminList()
      .then(setRows)
      .catch(() => setError("Could not load posts."))
      .finally(() => setLoading(false));

  useEffect(() => {
    void reload();
  }, []);

  const togglePublished = async (row: NewsAdminRow) => {
    try {
      await news.update(row.id, {
        status: row.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED",
      });
      await reload();
    } catch {
      setError("Could not change the status.");
    }
  };

  const remove = async (row: NewsAdminRow) => {
    if (
      !window.confirm(
        `Delete “${row.titleUz || row.titleRu}”? This cannot be undone.`,
      )
    )
      return;
    try {
      await news.remove(row.id);
      await reload();
    } catch {
      setError("Could not delete the post.");
    }
  };

  return (
    <Page>
      <Header>
        <div>
          <Title>News</Title>
          <Subtitle>
            Posts on posgro.uz/news and behind the dashboard’s news button.
          </Subtitle>
        </div>
        <Btn to="/admin/news/new">
          <Plus size={16} />
          New post
        </Btn>
      </Header>

      {error && <ErrorMsg>{error}</ErrorMsg>}

      {loading ? (
        <div style={{ display: "flex", gap: 8, color: "#6b7280" }}>
          <RefreshCw
            size={16}
            style={{ animation: "spin 1s linear infinite" }}
          />
          Loading…
        </div>
      ) : (
        <Card>
          {rows.length === 0 && <Empty>No posts yet.</Empty>}
          {rows.map((row) => (
            <Row key={row.id}>
              <Thumb>{row.coverUrl && <img src={row.coverUrl} alt="" />}</Thumb>
              <Main>
                <RowTitle>{row.titleUz || row.titleRu}</RowTitle>
                <Meta>
                  <Badge $tone={row.status === "PUBLISHED" ? "ok" : "muted"}>
                    {row.status === "PUBLISHED" ? "Published" : "Draft"}
                  </Badge>
                  {row.audience === "CUSTOMERS" && (
                    <Badge $tone="info">Customers only</Badge>
                  )}
                  <span>/news/{row.slug}</span>
                  <span>
                    · edited {new Date(row.updatedAt).toLocaleString("ru-RU")}
                  </span>
                </Meta>
              </Main>
              <IconBtn
                title={row.status === "PUBLISHED" ? "Unpublish" : "Publish"}
                onClick={() => togglePublished(row)}
              >
                {row.status === "PUBLISHED" ? (
                  <EyeOff size={16} />
                ) : (
                  <Eye size={16} />
                )}
              </IconBtn>
              <IconBtn
                title="Edit"
                onClick={() => navigate(`/admin/news/${row.id}`)}
              >
                <Pencil size={16} />
              </IconBtn>
              <IconBtn title="Delete" $danger onClick={() => remove(row)}>
                <Trash2 size={16} />
              </IconBtn>
            </Row>
          ))}
        </Card>
      )}
    </Page>
  );
}
