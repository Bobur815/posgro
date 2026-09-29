import styled from "styled-components";

export const Section = styled.section`
  padding: 56px 0;
`;

export const SectionTitle = styled.h2`
  margin: 0 0 8px;
  font-size: clamp(24px, 3.5vw, 32px);
  letter-spacing: -0.02em;
  text-align: center;
`;

export const SectionLede = styled.p`
  margin: 0 auto 36px;
  max-width: 560px;
  text-align: center;
  font-size: 16px;
  line-height: 1.6;
  color: ${({ theme }) => theme.colors.textSecondary};
`;
