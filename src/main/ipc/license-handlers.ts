import { ipcMain } from 'electron';
import { isSatellite } from '../lan/role';
import { licenseStatus, refreshLicense, type TillLicenseStatus } from '../license/license';

/**
 * A satellite holds no license: it signs in and sells through its main, which checks its own
 * (local-server/routes/satellite.ts). Its screens get a status that lets them through, and hear of
 * a block from the main's refusals.
 */
const SATELLITE_STATUS: TillLicenseStatus = {
  state: 'unlimited',
  daysLeft: null,
  plan: null,
  expiresAt: null,
  blockAt: null,
  clockBehind: false,
  canSignIn: true,
  canSell: true,
};

export function setupLicenseHandlers(): void {
  ipcMain.handle('license:getStatus', async (): Promise<TillLicenseStatus> =>
    (await isSatellite()) ? SATELLITE_STATUS : licenseStatus(),
  );

  /** "Check payment": ask the server now, then say where the till stands. */
  ipcMain.handle('license:refresh', async (): Promise<TillLicenseStatus> => {
    if (await isSatellite()) return SATELLITE_STATUS;
    await refreshLicense();
    return licenseStatus();
  });
}
