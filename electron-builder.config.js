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
  // Don't compile native modules for Electron. The only one shipped, serialport's bindings-cpp,
  // comes with N-API prebuilds (prebuilds/win32-x64), which load in any Electron without a rebuild;
  // rebuilding would need Visual Studio on the build machine and gain nothing. A future native
  // dependency without N-API prebuilds would need this back on.
  npmRebuild: false,
  // Native code cannot be loaded from inside an archive: Prisma's query engine is a .node DLL.
  // sqlite-client.ts requires the client by its app.asar path and Electron redirects to here.
  // serialport's binding (@serialport/bindings-cpp/prebuilds/win32-x64/*.node) is native too.
  asarUnpack: [
    'src/generated/prisma-sqlite/**/*',
    'node_modules/serialport/**/*',
    'node_modules/@serialport/bindings-cpp/**/*',
  ],

  // Electron's build-time switches (https://www.electronjs.org/docs/latest/tutorial/fuses). A till
  // runs the license checks in its main process, so nobody at the counter should be able to get
  // inside it: no --inspect debugger, no ELECTRON_RUN_AS_NODE to use POSGRO.exe as a plain Node,
  // no NODE_OPTIONS to preload code. And the exe only loads its own app.asar, checked against the
  // hash baked in at build time, so an edited archive does not start. The app forks no Node process
  // (printing spawns powershell), which is what makes runAsNode safe to turn off.
  electronFuses: {
    runAsNode: false,
    enableNodeOptionsEnvironmentVariable: false,
    enableNodeCliInspectArguments: false,
    enableEmbeddedAsarIntegrityValidation: true,
    onlyLoadAppFromAsar: true,
  },

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
    '!node_modules/**/*',
    // The one exception: serialport (label printer on a COM port) is external to the bundle because
    // of its native binding, so it ships with its whole runtime dependency tree. @serialport/**
    // includes the parsers, stream, binding-mock, bindings-interface and their nested node_modules;
    // debug + ms are binding-mock's. node-addon-api is build-time only and stays out.
    'node_modules/serialport/**/*',
    'node_modules/@serialport/**/*',
    'node_modules/node-gyp-build/**/*',
    'node_modules/debug/**/*',
    'node_modules/ms/**/*'
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
