import { useEffect, useState } from "react";
import styled from "styled-components";
import { Phone, RefreshCw } from "lucide-react";
import { leads, type Lead, type LeadStatus } from "../../api/client";

/**
 * Requests left through the "So'rov qoldiring" form on posgro.uz. Each one also arrives in the
 * super admins' Telegram the moment it is sent; this page is where it is followed up and closed.
 */

const STATUSES: LeadStatus[] = ["NEW", "CONTACTED", "CONVERTED", "REJECTED"];

const STATUS_LABEL: Record<LeadStatus, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  CONVERTED: "Converted",
  REJECTED: "Rejected",
};

const STORE_TYPE_LABEL: Record<string, string> = {
  GROCERY: "Grocery",
  SUPERMARKET: "Supermarket",
  MINIMARKET: "Minimarket",
  PHARMACY: "Pharmacy",
  HOUSEHOLD: "Household goods",
  OTHER: "Other",
};

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

const Filters = styled.div`
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
`;

const Chip = styled.button<{ $active: boolean }>`
  padding: 7px 14px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid
    ${({ theme, $active }) => ($active ? theme.colors.primary : theme.colors.border)};
  background: ${({ theme, $active }) => ($active ? theme.colors.primary : "transparent")};
  color: ${({ theme, $active }) => ($active ? "#fff" : theme.colors.textSecondary)};
`;

const Card = styled.div`
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 10px;
  padding: 4px 20px;
  background: ${({ theme }) => theme.colors.surface};
`;

const Row = styled.div`
  display: grid;
  grid-template-columns: 1fr 160px;
  gap: 8px 16px;
  padding: 16px 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  &:last-child {
    border-bottom: none;
  }
  @media (max-width: 600px) {
    grid-template-columns: 1fr;
  }
`;

const Name = styled.div`
  font-weight: 600;
  font-size: 15px;
  color: ${({ theme }) => theme.colors.text};
`;

const Meta = styled.div`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-top: 4px;
`;

const PhoneLink = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
  color: ${({ theme }) => theme.colors.primary};
`;

const Select = styled.select`
  width: 100%;
  padding: 8px 10px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 6px;
  font-size: 14px;
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
`;

const Note = styled.textarea`
  grid-column: 1 / -1;
  width: 100%;
  min-height: 38px;
  padding: 8px 10px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 6px;
  font: inherit;
  font-size: 13px;
  resize: vertical;
  background: transparent;
  color: ${({ theme }) => theme.colors.text};
  box-sizing: border-box;
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary};
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

/** `+998901234567` → `+998 90 123 45 67`. */
function formatPhone(p: string): string {
  const m = /^\+998(\d{2})(\d{3})(\d{2})(\d{2})$/.exec(p);
  return m ? `+998 ${m[1]} ${m[2]} ${m[3]} ${m[4]}` : p;
}

export function LeadsPage() {
  const [items, setItems] = useState<Lead[]>([]);
  const [filter, setFilter] = useState<LeadStatus | undefined>("NEW");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    leads
      .list(filter)
      .then(setItems)
      .catch(() => setError("Could not load requests."))
      .finally(() => setLoading(false));
  }, [filter]);

  const save = async (lead: Lead, patch: { status?: LeadStatus; note?: string }) => {
    try {
      const updated = await leads.update(lead.id, patch);
      // A status change moves the row out of a filtered view; a note edit keeps it in place.
      setItems((list) =>
        filter && updated.status !== filter
          ? list.filter((l) => l.id !== lead.id)
          : list.map((l) => (l.id === lead.id ? updated : l)),
      );
    } catch {
      setError("Could not save the change.");
    }
  };

  return (
    <Page>
      <Header>
        <div>
          <Title>Leads</Title>
          <Subtitle>Requests from the form on posgro.uz.</Subtitle>
        </div>
        <Filters>
          {STATUSES.map((s) => (
            <Chip key={s} $active={filter === s} onClick={() => setFilter(s)}>
              {STATUS_LABEL[s]}
            </Chip>
          ))}
          <Chip $active={!filter} onClick={() => setFilter(undefined)}>
            All
          </Chip>
        </Filters>
      </Header>

      {error && <ErrorMsg>{error}</ErrorMsg>}

      {loading ? (
        <div style={{ display: "flex", gap: 8, color: "#6b7280" }}>
          <RefreshCw size={16} style={{ animation: "spin 1s linear infinite" }} />
          Loading…
        </div>
      ) : (
        <Card>
          {items.length === 0 && <Empty>No requests here.</Empty>}
          {items.map((lead) => (
            <Row key={lead.id}>
              <div>
                <Name>
                  {lead.fullName} · {lead.storeName}
                </Name>
                <Meta>
                  {STORE_TYPE_LABEL[lead.storeType] ?? lead.storeType} · {lead.lang.toUpperCase()}{" "}
                  · {new Date(lead.createdAt).toLocaleString("ru-RU")}
                </Meta>
                <PhoneLink href={`tel:${lead.phone}`}>
                  <Phone size={14} />
                  {formatPhone(lead.phone)}
                </PhoneLink>
              </div>
              <Select
                value={lead.status}
                onChange={(e) => save(lead, { status: e.target.value as LeadStatus })}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </Select>
              <Note
                placeholder="Note"
                defaultValue={lead.note ?? ""}
                onBlur={(e) => {
                  if (e.target.value !== (lead.note ?? "")) save(lead, { note: e.target.value });
                }}
              />
            </Row>
          ))}
        </Card>
      )}
    </Page>
  );
}
