/**
 * Electron Builder Configuration
 * @see https://www.electron.build/configuration/configuration
 */
module.exports = {
  appId: 'uz.bobur-dev.posgro',
  productName: 'POSGRO',
  artifactName: 'POSGRO-Setup-${version}.exe',
  copyright: 'Copyright © 2026 Bobur',

  directories: {
    output: 'dist',
    buildResources: 'build'
  },

  asar: false,

  files: [
    'dist-electron/**/*',
    'dist-renderer/**/*',
    'src/generated/prisma-sqlite/**/*',
    'build/icons/**/*'
  ],

  extraResources: [
    {
      from: 'prisma',
      to: 'prisma',
      filter: ['**/*']
    },
    {
      from: 'build/icons',
      to: 'icons',
      filter: ['**/*']
    }
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
    installerHeaderIcon: 'build/icons/posgro-icon.ico',
    runAfterFinish: false
  },

  mac: {
    target: ['dmg'],
    icon: 'build/icons/posgro-icon.icns',
    category: 'public.app-category.business'
  },

  linux: {
    target: ['AppImage', 'deb'],
    icon: 'build/icons',
    category: 'Office'
  },

  publish: {
    provider: 'generic',
    url: 'https://pos.bobur-dev.uz/releases/',
    channel: 'latest'
  }
};
