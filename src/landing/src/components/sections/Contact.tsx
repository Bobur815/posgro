import styled from "styled-components";
import {
  Phone,
  Clock,
  Send,
  Instagram,
  Facebook,
  Link as LinkIcon,
} from "lucide-react";
import type { LandingContact } from "@shared/types/landing.types";
import { useLanding } from "../../context/LandingContext";
import { Section, SectionTitle, SectionLede } from "../common/Section";

const SOCIAL_ICONS: Record<string, typeof Send> = {
  telegram: Send,
  instagram: Instagram,
  facebook: Facebook,
};

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 20px;
  max-width: 760px;
  margin: 0 auto;
`;

const Card = styled.div`
  padding: 24px;
  border-radius: 12px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.surface};
  text-align: center;
`;

const Label = styled.div`
  font-size: 13px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-bottom: 8px;
`;

const Value = styled.a`
  font-size: 18px;
  font-weight: 700;
  text-decoration: none;
  color: ${({ theme }) => theme.colors.text};
  &:hover {
    color: ${({ theme }) => theme.colors.primary};
  }
`;

const Socials = styled.div`
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-top: 28px;
`;

const Social = styled.a`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 11px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.textSecondary};
  &:hover {
    color: ${({ theme }) => theme.colors.primary};
    border-color: ${({ theme }) => theme.colors.primary};
  }
`;

const labelIcon = { verticalAlign: -2, marginRight: 5 };

export function Contact({ contact }: { contact: LandingContact }) {
  const { t, ru } = useLanding();
  const hours = ru ? contact.workingHoursRu : contact.workingHoursUz;

  return (
    <Section id="contact">
      <SectionTitle>{t("contact.title")}</SectionTitle>
      <SectionLede>{t("contact.lede")}</SectionLede>
      <Grid>
        {contact.phones.map((p, i) => (
          <Card key={i}>
            <Label>
              <Phone size={13} style={labelIcon} />
              {p.label || t("contact.phone")}
            </Label>
            {/* tel: needs the digits, the page shows the readable form */}
            <Value href={`tel:${p.number.replace(/[^\d+]/g, "")}`}>{p.number}</Value>
          </Card>
        ))}
        {hours && (
          <Card>
            <Label>
              <Clock size={13} style={labelIcon} />
              {t("contact.hours")}
            </Label>
            <Value as="div">{hours}</Value>
          </Card>
        )}
      </Grid>

      {contact.socials.length > 0 && (
        <Socials>
          {contact.socials.map((s) => {
            const Icon = SOCIAL_ICONS[s.platform] ?? LinkIcon;
            return (
              <Social
                key={s.platform + s.url}
                href={s.url}
                target="_blank"
                rel="noreferrer noopener"
                title={s.platform}
                aria-label={s.platform}
              >
                <Icon size={20} />
              </Social>
            );
          })}
        </Socials>
      )}
    </Section>
  );
}
