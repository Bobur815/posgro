import { formatCountdown, formatLastSeen, settingsErrorKey } from "./terminalDialog.helpers";

describe("settingsErrorKey", () => {
  it("digs the key out of Electron's wrapper", () => {
    const err = new Error(
      "Error invoking remote method 'pairing:joinAsSatellite': Error: settings.pairingCodeWrong",
    );
    expect(settingsErrorKey(err)).toBe("settings.pairingCodeWrong");
  });

  it("keeps the underscores the main-terminal keys use", () => {
    expect(settingsErrorKey(new Error("Error: settings.mainTerminal_not_a_main"))).toBe(
      "settings.mainTerminal_not_a_main",
    );
  });

  // Anything else must not be shown raw — the caller falls back to a generic message.
  it("returns null when there is no key", () => {
    expect(settingsErrorKey(new Error("Error invoking remote method 'x': Error: boom"))).toBeNull();
    expect(settingsErrorKey(undefined)).toBeNull();
  });
});

describe("formatCountdown", () => {
  it.each([
    [600_000, "10:00"],
    [545_000, "9:05"],
    [1_200, "0:02"],
    [0, "0:00"],
    // A clock that has already passed the expiry never shows a negative time.
    [-5_000, "0:00"],
  ])("%d ms -> %s", (ms, text) => {
    expect(formatCountdown(ms)).toBe(text);
  });
});

describe("formatLastSeen", () => {
  it("is null for a satellite that has never reported in", () => {
    expect(formatLastSeen(null, "ru")).toBeNull();
  });

  it("is null for nonsense rather than 'Invalid Date'", () => {
    expect(formatLastSeen("not a date", "ru")).toBeNull();
  });

  it("formats a real time", () => {
    expect(formatLastSeen("2026-09-11T09:05:00Z", "ru")).toMatch(/\d{2}.\d{2}.*\d{2}:\d{2}/);
  });
});
