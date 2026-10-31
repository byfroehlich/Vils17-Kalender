import { describe, it, expect } from "vitest";
import { normalizeVapidSubject } from "../src/lib/push";

describe("normalizeVapidSubject", () => {
  it("ergänzt mailto: bei reiner Adresse", () => {
    expect(normalizeVapidSubject("info@vils17.at")).toBe("mailto:info@vils17.at");
    expect(normalizeVapidSubject(" info@vils17.at ")).toBe("mailto:info@vils17.at");
  });
  it("lässt gültige Angaben unverändert", () => {
    expect(normalizeVapidSubject("mailto:a@b.at")).toBe("mailto:a@b.at");
    expect(normalizeVapidSubject("https://vils17.at")).toBe("https://vils17.at");
  });
  it("fällt ohne Angabe auf die Hausadresse zurück", () => {
    expect(normalizeVapidSubject(undefined)).toBe("mailto:info@vils17.at");
    expect(normalizeVapidSubject("")).toBe("mailto:info@vils17.at");
  });
});
