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

  // One archive instead of thousands of loose files: an update copies (and Windows Defender scans)
  // a handful of files rather than ~24,000. Tested on Electron 40 (2026-09-22): the renderer's ES
  // modules, the preload, Prisma and the LAN dashboard's static files all load from inside it.
  asar: true,
  // Native code cannot be loaded from inside an archive: Prisma's query engine is a .node DLL.
  // sqlite-client.ts requires the client by its app.asar path and Electron redirects to here.
  asarUnpack: ['src/generated/prisma-sqlite/**/*'],

  files: [
    'dist-electron/**/*',
    'dist-renderer/**/*',
    // The web dashboard, served on the shop LAN by an OFFLINE_ONLY terminal so the owner can
    // open it on a phone with no internet. Built by `npm run build:web`, which `build:pos` runs.
    // Staged in dist-web rather than dist/web because `dist` is this config's own output
    // directory, which electron-builder excludes from `files`.
    'dist-web/**/*',
    'src/generated/prisma-sqlite/**/*',
    'build/icons/**/*',
    // Everything the main process needs is bundled into dist-electron (electron.vite.config.ts),
    // and the generated Prisma client carries its own runtime. Without this, electron-builder
    // copies every production dependency in package.json — the server's and web's included.
    '!node_modules/**/*'
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
