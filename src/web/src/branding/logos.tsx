import React from 'react';
import { BRAND_COLORS, ThemeMode } from './constants';

interface LogoProps {
  theme: ThemeMode;
}

// A. ICON ONLY — app icon, favicon, taskbar, system tray
export const POSGROIcon: React.FC<LogoProps & { size?: number }> = ({
  theme,
  size = 256,
}) => {
  const colors = BRAND_COLORS[theme];
  const gradId = `icon-grad-${size}-${theme}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 256 256"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={colors.primary} />
          <stop offset="100%" stopColor={colors.secondary} />
        </linearGradient>
      </defs>

      <rect width="256" height="256" rx="60" fill={`url(#${gradId})`} />

      <text
        x="128"
        y="175"
        fontFamily="Arial, sans-serif"
        fontSize="115"
        fontWeight="900"
        fill="white"
        textAnchor="middle"
        letterSpacing="-2"
      >
        PG
      </text>

    </svg>
  );
};

// B. WORDMARK ONLY — receipts, documents, email signatures
export const POSGROWordmark: React.FC<LogoProps & { fontSize?: number }> = ({
  theme,
  fontSize = 32,
}) => {
  const colors = BRAND_COLORS[theme];

  return (
    <svg
      width={fontSize * 6}
      height={fontSize * 1.5}
      viewBox="0 0 192 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <text
        x="0"
        y="35"
        fontFamily="'Poppins', Arial, sans-serif"
        fontSize="32"
        fontWeight="700"
        fill={colors.text}
        letterSpacing="1"
      >
        POSGRO
      </text>
    </svg>
  );
};

// C. HORIZONTAL (COMBINED) — app header, splash screen (primary logo)
export const POSGROHorizontal: React.FC<LogoProps & { height?: number }> = ({
  theme,
  height = 50,
}) => {
  const colors = BRAND_COLORS[theme];
  const ratio = height / 50;
  const gradId = `horiz-grad-${theme}`;

  return (
    <svg
      width={280 * ratio}
      height={height}
      viewBox="0 0 280 70"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={colors.primary} />
          <stop offset="100%" stopColor={colors.secondary} />
        </linearGradient>
      </defs>

      {/* Icon tile */}
      <rect x="10" y="10" width="50" height="50" rx="12" fill={`url(#${gradId})`} />
      <text
        x="35"
        y="50"
        fontFamily="Arial, sans-serif"
        fontSize="28"
        fontWeight="900"
        fill="white"
        textAnchor="middle"
      >
        PG
      </text>

      {/* Wordmark */}
      <text
        x="75"
        y="45"
        fontFamily="'Poppins', Arial, sans-serif"
        fontSize="32"
        fontWeight="700"
        fill={colors.text}
        letterSpacing="0.5"
      >
        POSGRO
      </text>

      {/* Tagline */}
      <text
        x="75"
        y="57"
        fontFamily="Arial, sans-serif"
        fontSize="9"
        fontWeight="500"
        fill={colors.text}
        opacity="0.6"
        letterSpacing="1"
      >
        SMART RETAIL SOLUTION
      </text>
    </svg>
  );
};

// D. SQUARE — social media, marketing, large contexts
export const POSGROSquare: React.FC<LogoProps & { size?: number }> = ({
  theme,
  size = 400,
}) => {
  const colors = BRAND_COLORS[theme];
  const gradId = `square-grad-${theme}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 400 400"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={colors.primary} />
          <stop offset="100%" stopColor={colors.secondary} />
        </linearGradient>
      </defs>

      {/* Background halo */}
      <circle cx="200" cy="200" r="180" fill={colors.primary} opacity="0.08" />

      {/* Icon tile */}
      <g transform="translate(120, 80)">
        <rect width="160" height="160" rx="35" fill={`url(#${gradId})`} />
        <text
          x="80"
          y="115"
          fontFamily="Arial, sans-serif"
          fontSize="80"
          fontWeight="900"
          fill="white"
          textAnchor="middle"
        >
          PG
        </text>
        {/* Cart detail */}
        <g transform="translate(103, 28)" opacity="0.9">
          <path
            d="M0 0 L3 0 L5 10 L13 10 M11 13 A1.5 1.5 0 1 1 11 16 A1.5 1.5 0 1 1 11 13 M6 13 A1.5 1.5 0 1 1 6 16 A1.5 1.5 0 1 1 6 13"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            fill="none"
          />
        </g>
      </g>

      {/* Wordmark */}
      <text
        x="200"
        y="295"
        fontFamily="'Poppins', Arial, sans-serif"
        fontSize="42"
        fontWeight="700"
        fill={colors.text}
        textAnchor="middle"
      >
        POSGRO
      </text>

      {/* Tagline */}
      <text
        x="200"
        y="322"
        fontFamily="Arial, sans-serif"
        fontSize="14"
        fontWeight="500"
        fill={colors.text}
        opacity="0.5"
        textAnchor="middle"
        letterSpacing="2"
      >
        SMART RETAIL SOLUTION
      </text>
    </svg>
  );
};

export default {
  Icon: POSGROIcon,
  Wordmark: POSGROWordmark,
  Horizontal: POSGROHorizontal,
  Square: POSGROSquare,
};
