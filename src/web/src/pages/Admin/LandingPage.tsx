import React, { useEffect, useState } from "react";
import styled from "styled-components";
import { RefreshCw, Save, Plus, Trash2 } from "lucide-react";
import {
  siteConfig,
  type SubscriptionPlanPrices,
} from "../../api/client";
import {
  LANDING_PLAN_IDS,
  KNOWN_SOCIAL_PLATFORMS,
  DEFAULT_LANDING_CONTACT,
  emptyLandingPlan,
  type LandingPlan,
  type LandingPlanId,
  type LandingContact,
} from "@shared/types/landing.types";

/**
 * Edits the parts of posgro.uz that change without a release: how the three tiers are described,
 * and how to reach the company.
 *
 * The landing page is static and renders baked-in fallbacks first, so a save here is not visible
 * to a visitor until their next page load — and never leaves the page blank if this config is
 * empty or the API is down.
 *
 * Price lives on this page but is NOT part of the landing config: it is written to
 * `subscription_plan_prices`, the key the subscription system actually bills from. One number,
 * shown in the place the operator is already thinking about the tier, with no second copy to
 * drift (tasks/DOMAIN_MIGRATION_POSGRO.md §9.1).
 */

const Page = styled.div`
  padding: 32px;
  max-width: 900px;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 32px;
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

const Card = styled.div<{ $accent?: string }>`
  border: 2px solid ${({ $accent, theme }) => $accent ?? theme.colors.border};
  border-radius: 10px;
  padding: 24px;
  background: ${({ theme }) => theme.colors.surface};
  margin-bottom: 20px;
`;

const PlanName = styled.div<{ $color?: string }>`
  font-size: 20px;
  font-weight: 700;
  color: ${({ $color, theme }) => $color ?? theme.colors.text};
  margin-bottom: 16px;
  text-transform: capitalize;
`;

const Label = styled.label`
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-bottom: 6px;
`;

const inputStyles = `
  width: 100%;
  padding: 10px 12px;
  border-radius: 6px;
  font-size: 15px;
  background: transparent;
  box-sizing: border-box;
`;

const Input = styled.input`
  ${inputStyles}
  border: 1px solid ${({ theme }) => theme.colors.border};
  color: ${({ theme }) => theme.colors.text};
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary};
  }
`;

const Textarea = styled.textarea`
  ${inputStyles}
  border: 1px solid ${({ theme }) => theme.colors.border};
  color: ${({ theme }) => theme.colors.text};
  min-height: 96px;
  font-family: inherit;
  line-height: 1.6;
  resize: vertical;
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary};
  }
`;

const Field = styled.div`
  margin-bottom: 18px;
`;

const FieldHint = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-top: 6px;
  line-height: 1.5;
`;

const TwoCol = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0 20px;

  @media (max-width: 700px) {
    grid-template-columns: 1fr;
  }
`;

const CheckRow = styled.label`
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text};
  cursor: pointer;

  input {
    width: 18px;
    height: 18px;
  }
`;

const Section = styled.div`
  margin-top: 40px;
`;

const SectionTitle = styled.h2`
  margin: 0 0 4px;
  font-size: 20px;
  color: ${({ theme }) => theme.colors.text};
`;

const Row = styled.div`
  display: flex;
  gap: 10px;
  align-items: flex-start;
  margin-bottom: 10px;
`;

const IconBtn = styled.button`
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 6px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: transparent;
  color: ${({ theme }) => theme.colors.textSecondary};
  cursor: pointer;
  &:hover {
    color: ${({ theme }) => theme.colors.error};
    border-color: ${({ theme }) => theme.colors.error};
  }
`;

const AddBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 6px;
  border: 1px dashed ${({ theme }) => theme.colors.border};
  background: transparent;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 14px;
  cursor: pointer;
  &:hover {
    color: ${({ theme }) => theme.colors.primary};
    border-color: ${({ theme }) => theme.colors.primary};
  }
`;

const SaveBtn = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 24px;
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

const SuccessMsg = styled.div`
  color: #16a34a;
  font-size: 14px;
  margin-top: 12px;
`;

const ErrorMsg = styled.div`
  color: ${({ theme }) => theme.colors.error};
  font-size: 14px;
  margin-top: 12px;
`;

const PLAN_ACCENTS: Record<LandingPlanId, string> = {
  starter: "#3b82f6",
  pro: "#8b5cf6",
  vip: "#f59e0b",
};

/** Bullets are edited as one per line — a repeater for a short list is more clicks, not less. */
const toLines = (list: string[]) => list.join("\n");
const fromLines = (text: string) => text.split("\n");

export function LandingPage() {
  const [plans, setPlans] = useState<LandingPlan[]>(
    LANDING_PLAN_IDS.map((id, i) => emptyLandingPlan(id, i)),
  );
  const [prices, setPrices] = useState<SubscriptionPlanPrices>({ starter: 0, pro: 0, vip: 0, extraTerminal: 0 });
  const [contact, setContact] = useState<LandingContact>(DEFAULT_LANDING_CONTACT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      siteConfig.getLandingPlans().then(setPlans),
      siteConfig.getSubscriptionPlans().then(setPrices),
      siteConfig.getLandingContact().then(setContact),
    ])
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const patchPlan = (id: LandingPlanId, patch: Partial<LandingPlan>) =>
    setPlans((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  // Radio semantics, enforced here as well as on the server: clicking a highlight clears the
  // others, and clicking the current one turns it off, so "no badge" stays reachable.
  const toggleHighlight = (id: LandingPlanId) =>
    setPlans((prev) =>
      prev.map((p) => ({ ...p, highlighted: p.id === id ? !p.highlighted : false })),
    );

  const patchContact = (patch: Partial<LandingContact>) =>
    setContact((prev) => ({ ...prev, ...patch }));

  const handleSave = async () => {
    setSaving(true);
    setSuccess(false);
    setError(null);
    try {
      // `order` follows the on-screen order; the pricing table reads it rather than relying on
      // array position surviving a round trip.
      setPlans(await siteConfig.setLandingPlans(plans.map((p, i) => ({ ...p, order: i }))));
      await siteConfig.setSubscriptionPlans(prices);
      setContact(
        await siteConfig.setLandingContact({
          ...contact,
          socials: contact.socials.map((s, i) => ({ ...s, order: i })),
        }),
      );
      setSuccess(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Page>
      <Header>
        <div>
          <Title>Landing Page</Title>
          <Subtitle>
            Tariff details and contact information shown on posgro.uz. Visitors see changes on
            their next page load.
          </Subtitle>
        </div>
        <SaveBtn onClick={handleSave} disabled={saving || loading}>
          <Save size={16} />
          {saving ? "Saving…" : "Save"}
        </SaveBtn>
      </Header>

      {loading ? (
        <div style={{ display: "flex", gap: 8, color: "#6b7280" }}>
          <RefreshCw size={16} style={{ animation: "spin 1s linear infinite" }} />
          Loading…
        </div>
      ) : (
        <>
          <SectionTitle>Tariff plans</SectionTitle>
          <Subtitle style={{ marginBottom: 20 }}>
            The price is the one the subscription system charges — the same value as on the
            Subscription Plans page, not a separate marketing figure.
          </Subtitle>

          {plans.map((plan) => (
            <Card key={plan.id} $accent={PLAN_ACCENTS[plan.id]}>
              <PlanName $color={PLAN_ACCENTS[plan.id]}>{plan.id}</PlanName>

              <Field>
                <Label>Price (UZS / month)</Label>
                <Input
                  type="number"
                  min={0}
                  value={prices[plan.id]}
                  onChange={(e) =>
                    setPrices({ ...prices, [plan.id]: Number(e.target.value) || 0 })
                  }
                />
                <FieldHint>Shared with the Subscription Plans page and the POS.</FieldHint>
              </Field>

              <TwoCol>
                <Field>
                  <Label>Name (UZ)</Label>
                  <Input
                    value={plan.nameUz}
                    onChange={(e) => patchPlan(plan.id, { nameUz: e.target.value })}
                  />
                </Field>
                <Field>
                  <Label>Name (RU)</Label>
                  <Input
                    value={plan.nameRu}
                    onChange={(e) => patchPlan(plan.id, { nameRu: e.target.value })}
                  />
                </Field>
                <Field>
                  <Label>Tagline (UZ)</Label>
                  <Input
                    value={plan.taglineUz}
                    onChange={(e) => patchPlan(plan.id, { taglineUz: e.target.value })}
                  />
                </Field>
                <Field>
                  <Label>Tagline (RU)</Label>
                  <Input
                    value={plan.taglineRu}
                    onChange={(e) => patchPlan(plan.id, { taglineRu: e.target.value })}
                  />
                </Field>
                <Field>
                  <Label>Features (UZ)</Label>
                  <Textarea
                    value={toLines(plan.featuresUz)}
                    onChange={(e) => patchPlan(plan.id, { featuresUz: fromLines(e.target.value) })}
                  />
                  <FieldHint>One per line. Blank lines are dropped.</FieldHint>
                </Field>
                <Field>
                  <Label>Features (RU)</Label>
                  <Textarea
                    value={toLines(plan.featuresRu)}
                    onChange={(e) => patchPlan(plan.id, { featuresRu: fromLines(e.target.value) })}
                  />
                  <FieldHint>One per line. Blank lines are dropped.</FieldHint>
                </Field>
              </TwoCol>

              <Field>
                <Label>Button link</Label>
                <Input
                  placeholder="https://t.me/… — defaults to your Telegram if left empty"
                  value={plan.ctaUrl ?? ""}
                  onChange={(e) => patchPlan(plan.id, { ctaUrl: e.target.value })}
                />
              </Field>

              <CheckRow>
                <input
                  type="checkbox"
                  checked={plan.highlighted}
                  onChange={() => toggleHighlight(plan.id)}
                />
                Show as “most popular”
              </CheckRow>
            </Card>
          ))}

          <Section>
            <SectionTitle>Contact</SectionTitle>
            <Subtitle style={{ marginBottom: 20 }}>
              Shown in the landing page footer and contact section.
            </Subtitle>

            <Card>
              <Label>Phone numbers</Label>
              {contact.phones.map((phone, i) => (
                <Row key={i}>
                  <Input
                    placeholder="Label — e.g. Sotuv"
                    style={{ flex: "0 0 200px" }}
                    value={phone.label}
                    onChange={(e) =>
                      patchContact({
                        phones: contact.phones.map((p, j) =>
                          j === i ? { ...p, label: e.target.value } : p,
                        ),
                      })
                    }
                  />
                  <Input
                    placeholder="+998 90 123 45 67"
                    value={phone.number}
                    onChange={(e) =>
                      patchContact({
                        phones: contact.phones.map((p, j) =>
                          j === i ? { ...p, number: e.target.value } : p,
                        ),
                      })
                    }
                  />
                  <IconBtn
                    type="button"
                    title="Remove"
                    onClick={() =>
                      patchContact({ phones: contact.phones.filter((_, j) => j !== i) })
                    }
                  >
                    <Trash2 size={16} />
                  </IconBtn>
                </Row>
              ))}
              <AddBtn
                type="button"
                onClick={() =>
                  patchContact({ phones: [...contact.phones, { label: "", number: "" }] })
                }
              >
                <Plus size={14} /> Add phone
              </AddBtn>
              <FieldHint>A row with no number is dropped when saved.</FieldHint>
            </Card>

            <Card>
              <Label>Social accounts</Label>
              {contact.socials.map((social, i) => (
                <Row key={i}>
                  <Input
                    list="social-platforms"
                    placeholder="telegram"
                    style={{ flex: "0 0 200px" }}
                    value={social.platform}
                    onChange={(e) =>
                      patchContact({
                        socials: contact.socials.map((s, j) =>
                          j === i ? { ...s, platform: e.target.value } : s,
                        ),
                      })
                    }
                  />
                  <Input
                    placeholder="https://t.me/posgro"
                    value={social.url}
                    onChange={(e) =>
                      patchContact({
                        socials: contact.socials.map((s, j) =>
                          j === i ? { ...s, url: e.target.value } : s,
                        ),
                      })
                    }
                  />
                  <IconBtn
                    type="button"
                    title="Remove"
                    onClick={() =>
                      patchContact({ socials: contact.socials.filter((_, j) => j !== i) })
                    }
                  >
                    <Trash2 size={16} />
                  </IconBtn>
                </Row>
              ))}
              <datalist id="social-platforms">
                {KNOWN_SOCIAL_PLATFORMS.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
              <AddBtn
                type="button"
                onClick={() =>
                  patchContact({
                    socials: [
                      ...contact.socials,
                      { platform: "", url: "", order: contact.socials.length },
                    ],
                  })
                }
              >
                <Plus size={14} /> Add account
              </AddBtn>
              <FieldHint>
                Any platform name works. These get an icon: {KNOWN_SOCIAL_PLATFORMS.join(", ")}.
                Anything else shows a generic link icon, so a new network needs no release.
              </FieldHint>
            </Card>

            <Card>
              <TwoCol>
                <Field>
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={contact.email}
                    onChange={(e) => patchContact({ email: e.target.value })}
                  />
                </Field>
                <div />
                <Field>
                  <Label>Address (UZ)</Label>
                  <Input
                    value={contact.addressUz}
                    onChange={(e) => patchContact({ addressUz: e.target.value })}
                  />
                </Field>
                <Field>
                  <Label>Address (RU)</Label>
                  <Input
                    value={contact.addressRu}
                    onChange={(e) => patchContact({ addressRu: e.target.value })}
                  />
                </Field>
                <Field>
                  <Label>Working hours (UZ)</Label>
                  <Input
                    placeholder="Dush–Shan, 9:00–18:00"
                    value={contact.workingHoursUz}
                    onChange={(e) => patchContact({ workingHoursUz: e.target.value })}
                  />
                </Field>
                <Field>
                  <Label>Working hours (RU)</Label>
                  <Input
                    placeholder="Пн–Сб, 9:00–18:00"
                    value={contact.workingHoursRu}
                    onChange={(e) => patchContact({ workingHoursRu: e.target.value })}
                  />
                </Field>
              </TwoCol>
            </Card>
          </Section>

          {success && <SuccessMsg>Saved.</SuccessMsg>}
          {error && <ErrorMsg>{error}</ErrorMsg>}
        </>
      )}
    </Page>
  );
}
