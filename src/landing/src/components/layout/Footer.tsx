import styled from "styled-components";
import { useLanding } from "../../context/LandingContext";
import { DASHBOARD_URL, PANEL_URL } from "../../config";

const Bar = styled.footer`
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.surface};
  padding: 28px 24px;
  margin-top: 40px;
  text-align: center;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const FooterLinks = styled.div`
  display: flex;
  justify-content: center;
  gap: 20px;
  margin-bottom: 12px;
  flex-wrap: wrap;
  a {
    color: ${({ theme }) => theme.colors.primary};
    text-decoration: none;
    font-weight: 600;
  }
  a:hover {
    text-decoration: underline;
  }
`;

export function Footer({ telegram }: { telegram?: string }) {
  const { t } = useLanding();

  return (
    <Bar>
      <FooterLinks>
        <a href={DASHBOARD_URL}>{t("footer.dashboard")}</a>
        <a href={PANEL_URL}>{t("footer.download")}</a>
        {telegram && (
          <a href={telegram} target="_blank" rel="noreferrer noopener">
            {t("contact.write")}
          </a>
        )}
      </FooterLinks>
      © {new Date().getFullYear()} POSGRO. {t("footer.rights")}
    </Bar>
  );
}
