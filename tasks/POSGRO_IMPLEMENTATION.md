# POSGRO Branding Implementation Guide

## Overview

This guide implements the complete POSGRO branding system for the grocery POS application. The icon + wordmark system provides maximum flexibility across all use cases.

---

## 1. Brand Assets Implementation

### File Structure
```
src/renderer/branding/
├── logos.tsx                 # All logo components
├── constants.ts              # Brand colors and constants
└── index.ts                  # Exports

build/icons/
├── posgro-icon-1024.png     # Source (to be generated)
├── posgro-icon.ico          # Windows icon (to be generated)
├── 16x16.png
├── 32x32.png
├── 48x48.png
├── 64x64.png
├── 128x128.png
└── 256x256.png
```

### Step 1: Create Brand Constants

**File**: `src/renderer/branding/constants.ts`

```typescript
// Brand color definitions
export const BRAND_COLORS = {
  light: {
    primary: '#1976d2',
    secondary: '#dc004e',
    text: '#000000',
    surface: '#ffffff',
  },
  dark: {
    primary: '#90caf9',
    secondary: '#f48fb1',
    text: '#ffffff',
    surface: '#1e1e1e',
  },
} as const;

export type ThemeMode = 'light' | 'dark';

export const BRAND_NAME = 'POSGRO';
export const BRAND_TAGLINE = 'SMART RETAIL SOLUTION';
export const BRAND_TAGLINE_RU = 'ТОЧКА ПРОДАЖ';
export const BRAND_TAGLINE_UZ = 'SAVDO NUQTASI';
```

### Step 2: Create Logo Components

**File**: `src/renderer/branding/logos.tsx`

```typescript
import React from 'react';
import { BRAND_COLORS, ThemeMode } from './constants';

interface LogoProps {
  theme: ThemeMode;
}

// 1. ICON ONLY - For app icon, favicon, small sizes
export const POSGROIcon: React.FC<LogoProps & { size?: number }> = ({ 
  theme, 
  size = 256 
}) => {
  const colors = BRAND_COLORS[theme];

  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 256 256" 
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={`icon-gradient-${size}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={colors.primary} />
          <stop offset="100%" stopColor={colors.secondary} />
        </linearGradient>
      </defs>
      
      {/* Background with gradient */}
      <rect 
        width="256" 
        height="256" 
        rx="60" 
        fill={`url(#icon-gradient-${size})`}
      />
      
      {/* PG Text - Clean, no decorations */}
      <text 
        x="128" 
        y="175" 
        fontFamily="'Montserrat', 'Arial', sans-serif" 
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

// 2. WORDMARK ONLY - For receipts, documents, emails
export const POSGROWordmark: React.FC<LogoProps & { fontSize?: number }> = ({ 
  theme,
  fontSize = 32 
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
        fontFamily="'Poppins', 'Arial', sans-serif" 
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

// 3. HORIZONTAL - For app header, splash screen
export const POSGROHorizontal: React.FC<LogoProps & { height?: number }> = ({ 
  theme, 
  height = 50 
}) => {
  const colors = BRAND_COLORS[theme];
  const ratio = height / 50;

  return (
    <svg 
      width={280 * ratio} 
      height={height} 
      viewBox="0 0 280 70" 
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="horizontal-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={colors.primary} />
          <stop offset="100%" stopColor={colors.secondary} />
        </linearGradient>
      </defs>
      
      {/* Icon */}
      <rect 
        x="10" 
        y="10" 
        width="50" 
        height="50" 
        rx="12" 
        fill="url(#horizontal-gradient)"
      />
      <text 
        x="35" 
        y="50" 
        fontFamily="'Montserrat', 'Arial', sans-serif" 
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
        fontFamily="'Poppins', 'Arial', sans-serif" 
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
        fontFamily="'Arial', sans-serif" 
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

// 4. SQUARE - For social media, square contexts
export const POSGROSquare: React.FC<LogoProps & { size?: number }> = ({ 
  theme,
  size = 400 
}) => {
  const colors = BRAND_COLORS[theme];

  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 400 400" 
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="square-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={colors.primary} />
          <stop offset="100%" stopColor={colors.secondary} />
        </linearGradient>
      </defs>
      
      {/* Background circle */}
      <circle 
        cx="200" 
        cy="200" 
        r="180" 
        fill={colors.primary} 
        opacity="0.08"
      />
      
      {/* Icon */}
      <g transform="translate(120, 120)">
        <rect 
          width="160" 
          height="160" 
          rx="35" 
          fill="url(#square-gradient)"
        />
        <text 
          x="80" 
          y="115" 
          fontFamily="'Montserrat', 'Arial', sans-serif" 
          fontSize="80" 
          fontWeight="900" 
          fill="white" 
          textAnchor="middle"
        >
          PG
        </text>
      </g>
      
      {/* Text below */}
      <text 
        x="200" 
        y="330" 
        fontFamily="'Poppins', 'Arial', sans-serif" 
        fontSize="42" 
        fontWeight="700" 
        fill={colors.text} 
        textAnchor="middle"
      >
        POSGRO
      </text>
      
      <text 
        x="200" 
        y="355" 
        fontFamily="'Arial', sans-serif" 
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
```

### Step 3: Create Index Export

**File**: `src/renderer/branding/index.ts`

```typescript
export * from './logos';
export * from './constants';
```

---

## 2. Application Integration

### Update App Header

**File**: `src/renderer/components/layout/Header.tsx`

```typescript
import React from 'react';
import styled from 'styled-components';
import { POSGROHorizontal } from '../../branding';
import { useTheme } from '../../theme/ThemeProvider';

const HeaderContainer = styled.header`
  background: ${({ theme }) => theme.colors.surface};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  padding: 12px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 64px;
  box-shadow: ${({ theme }) => theme.shadows.sm};
`;

const LogoContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
`;

const TerminalBadge = styled.span`
  background: ${({ theme }) => theme.colors.primary};
  color: white;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
`;

const UserInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.text};
`;

export const Header: React.FC = () => {
  const { mode } = useTheme();
  const terminalId = process.env.TERMINAL_ID || 'TERMINAL_01';
  
  // Get user from auth context (implement as needed)
  const user = { name: 'Кассир' }; // Replace with actual user

  return (
    <HeaderContainer>
      <LogoContainer>
        <POSGROHorizontal theme={mode} height={40} />
        <TerminalBadge>{terminalId}</TerminalBadge>
      </LogoContainer>
      
      <UserInfo>
        {user.name}
      </UserInfo>
    </HeaderContainer>
  );
};
```

### Update Loading Screen

**File**: `src/renderer/components/LoadingScreen.tsx`

```typescript
import React, { useEffect, useState } from 'react';
import styled, { keyframes } from 'styled-components';
import { POSGROSquare } from '../branding';
import { useTheme } from '../theme/ThemeProvider';

const pulse = keyframes`
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.8; transform: scale(0.98); }
`;

const LoadingContainer = styled.div`
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: ${({ theme }) => theme.colors.background};
`;

const LogoWrapper = styled.div`
  animation: ${pulse} 2s ease-in-out infinite;
`;

const LoadingText = styled.div`
  margin-top: 32px;
  font-size: 16px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const ProgressBar = styled.div`
  width: 200px;
  height: 3px;
  background: ${({ theme }) => theme.colors.border};
  border-radius: 2px;
  margin-top: 16px;
  overflow: hidden;
`;

const Progress = styled.div<{ progress: number }>`
  width: ${({ progress }) => progress}%;
  height: 100%;
  background: linear-gradient(90deg, #1976d2, #dc004e);
  transition: width 0.3s ease;
`;

export const LoadingScreen: React.FC<{ onComplete?: () => void }> = ({ 
  onComplete 
}) => {
  const { mode } = useTheme();
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          if (onComplete) {
            setTimeout(onComplete, 500);
          }
          return 100;
        }
        return prev + 10;
      });
    }, 200);

    return () => clearInterval(interval);
  }, [onComplete]);

  return (
    <LoadingContainer>
      <LogoWrapper>
        <POSGROSquare theme={mode} size={250} />
      </LogoWrapper>
      <LoadingText>Загрузка системы...</LoadingText>
      <ProgressBar>
        <Progress progress={progress} />
      </ProgressBar>
    </LoadingContainer>
  );
};
```

### Update Login Page

**File**: `src/renderer/pages/Login/LoginPage.tsx`

```typescript
import React from 'react';
import styled from 'styled-components';
import { POSGROSquare } from '../../branding';
import { useTheme } from '../../theme/ThemeProvider';

const LoginContainer = styled.div`
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${({ theme }) => theme.colors.background};
`;

const LoginCard = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius};
  box-shadow: ${({ theme }) => theme.shadows.lg};
  padding: 48px;
  width: 400px;
  text-align: center;
`;

const LogoWrapper = styled.div`
  margin-bottom: 32px;
  display: flex;
  justify-content: center;
`;

export const LoginPage: React.FC = () => {
  const { mode } = useTheme();

  return (
    <LoginContainer>
      <LoginCard>
        <LogoWrapper>
          <POSGROSquare theme={mode} size={150} />
        </LogoWrapper>
        
        <h1>Добро пожаловать</h1>
        <p>Войдите в систему POSGRO</p>
        
        {/* Your login form here */}
      </LoginCard>
    </LoginContainer>
  );
};
```

---

## 3. Electron Configuration

### Update Electron Builder Config

**File**: `electron-builder.config.js`

```javascript
module.exports = {
  appId: 'uz.bobur-dev.posgro',
  productName: 'POSGRO',
  directories: {
    output: 'dist',
    buildResources: 'build'
  },
  files: [
    'dist-electron/**/*',
    'dist-renderer/**/*'
  ],
  win: {
    target: [
      {
        target: 'nsis',
        arch: ['x64']
      }
    ],
    icon: 'build/icons/posgro-icon.ico',
    artifactName: 'POSGRO-Setup-${version}.exe'
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'POSGRO',
    installerIcon: 'build/icons/posgro-icon.ico',
    uninstallerIcon: 'build/icons/posgro-icon.ico',
  },
  mac: {
    category: 'public.app-category.business',
    icon: 'build/icons/posgro-icon.icns'
  },
  linux: {
    target: ['AppImage', 'deb'],
    category: 'Office',
    icon: 'build/icons/'
  }
};
```

### Update Main Window

**File**: `src/main/window.ts`

```typescript
import { BrowserWindow } from 'electron';
import path from 'path';

export function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'POSGRO - Касса',
    icon: path.join(__dirname, '../../build/icons/256x256.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    backgroundColor: '#f5f5f5', // Light theme background
  });

  mainWindow.setTitle('POSGRO - Точка Продаж');
  
  return mainWindow;
}
```

---

## 4. Package.json Updates

**File**: `package.json`

Update the following fields:

```json
{
  "name": "posgro",
  "productName": "POSGRO",
  "version": "1.0.0",
  "description": "POSGRO - Modern offline-first Point of Sale system for grocery stores",
  "author": "Bobur <bobur.dev@example.com>",
  "homepage": "https://pos.bobur-dev.uz",
  "scripts": {
    "dev:pos": "cross-env APP_MODE=pos electron-vite dev",
    "dev:server": "cross-env APP_MODE=server nest start --watch",
    "build:pos": "cross-env APP_MODE=pos electron-vite build && electron-builder",
    "build:server": "cross-env APP_MODE=server nest build",
    "generate-icons": "tsx scripts/generate-icons.ts"
  }
}
```

---

## 5. Environment Variables

### Update .env.pos

```bash
# POSGRO POS Terminal Configuration
APP_NAME=POSGRO
APP_MODE=pos

# Database
DATABASE_PROVIDER=sqlite
DATABASE_URL=file:./posgro-local.db

# VPS Connection
VPS_API_URL=https://pos.bobur-dev.uz/api

# Terminal Identity
TERMINAL_ID=TERMINAL_01

# Branding
APP_TITLE="POSGRO - Касса"
COMPANY_NAME="POSGRO"
```

### Update .env.server

```bash
# POSGRO VPS Server Configuration
APP_NAME=POSGRO
APP_MODE=server

# Database
DATABASE_PROVIDER=postgresql
DATABASE_URL=postgresql://posgro_user:${DB_PASSWORD}@localhost:5432/posgro

# Telegram Bot
TELEGRAM_BOT_USERNAME=posgro_bot
```

---

## 6. Icon Generation Script

**File**: `scripts/generate-icons.ts`

```typescript
import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';

const sizes = [16, 32, 48, 64, 128, 256];

async function generateIcons() {
  const buildDir = path.join(__dirname, '../build/icons');
  const sourcePath = path.join(buildDir, 'posgro-icon-1024.png');
  
  // Ensure directory exists
  await fs.mkdir(buildDir, { recursive: true });
  
  console.log('🎨 Generating POSGRO icons...\n');
  
  for (const size of sizes) {
    const outputPath = path.join(buildDir, `${size}x${size}.png`);
    
    await sharp(sourcePath)
      .resize(size, size, {
        kernel: sharp.kernel.lanczos3,
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png({ quality: 100 })
      .toFile(outputPath);
    
    console.log(`✓ Generated ${size}x${size}.png`);
  }
  
  console.log('\n✅ All POSGRO icons generated successfully!');
  console.log('📝 Next: Convert to .ico using electron-icon-maker or png-to-ico');
}

generateIcons().catch(console.error);
```

---

## 7. Docker & VPS Updates

### Update docker-compose.yml

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    container_name: posgro-db
    environment:
      POSTGRES_DB: posgro
    # ... rest of config

  api:
    container_name: posgro-api
    # ... rest of config

volumes:
  posgro_data:

networks:
  posgro-network:
```

### Update nginx.conf

```nginx
http {
    upstream posgro_api {
        server api:3000;
    }

    server {
        listen 443 ssl http2;
        server_name pos.bobur-dev.uz;
        
        # ... SSL config
        
        location /api/ {
            proxy_pass http://posgro_api/;
            add_header X-Powered-By "POSGRO v1.0" always;
        }
    }
}
```

---

## 8. Translation Updates

### Update Russian translations

**File**: `src/renderer/i18n/locales/ru.json`

```json
{
  "app": {
    "name": "POSGRO",
    "title": "POSGRO - Касса",
    "description": "Современная система для магазина"
  }
}
```

### Update Uzbek translations

**File**: `src/renderer/i18n/locales/uz.json`

```json
{
  "app": {
    "name": "POSGRO",
    "title": "POSGRO - Kassa",
    "description": "Zamonaviy do'kon tizimi"
  }
}
```

---

## 9. Installation & Setup

### Dependencies

```bash
# Install icon generation tool
npm install --save-dev sharp

# Install type definitions if needed
npm install --save-dev @types/sharp
```

### Build Process

```bash
# 1. Generate icons (after creating source image)
npm run generate-icons

# 2. Build POS application
npm run build:pos

# 3. Build server
npm run build:server
```

---

## 10. Testing Checklist

- [ ] App icon displays in Windows taskbar
- [ ] App icon displays in system tray
- [ ] Desktop shortcut created with correct icon
- [ ] Header shows logo at correct size
- [ ] Loading screen displays properly
- [ ] Login screen shows logo
- [ ] Light/Dark theme switching works
- [ ] Receipts print with correct branding
- [ ] All translations reference POSGRO
- [ ] Environment variables updated
- [ ] Docker containers renamed

---

## 11. Deployment

### VPS Deployment

```bash
# SSH into VPS
ssh root@144.91.121.160

# Navigate to project
cd /opt/posgro

# Pull latest changes
git pull origin main

# Rebuild containers
docker-compose down
docker-compose up -d --build

# Verify
docker-compose logs -f
```

### POS Terminal Deployment

1. Build installer: `npm run build:pos`
2. Copy `POSGRO-Setup-1.0.0.exe` to terminal
3. Run installer as Administrator
4. Verify icon and branding

---

## Quick Reference

| Component | File | Purpose |
|-----------|------|---------|
| Icon | `POSGROIcon` | App icon, favicon, small sizes |
| Wordmark | `POSGROWordmark` | Receipts, documents |
| Horizontal | `POSGROHorizontal` | App header, splash |
| Square | `POSGROSquare` | Social media, marketing |

**Colors:**
- Light: Primary `#1976d2`, Secondary `#dc004e`
- Dark: Primary `#90caf9`, Secondary `#f48fb1`

---

## Support

For issues or questions:
- GitHub: [@bobur-dev](https://github.com/bobur-dev/posgro)
- Email: bobur.dev@example.com
