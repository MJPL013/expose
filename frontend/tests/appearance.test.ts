import { describe, expect, it } from "vitest";
import {
  appearanceOptions,
  appearanceParts,
  avatarColors,
  avatarSvg,
  decodeAppearance,
  encodeAppearance,
  MAX_AVATAR_ID,
} from "@expose/shared/game/appearance";
import { GuestSchema } from "@expose/shared/network";
import { SetupSchema } from "@expose/shared/game/contracts";

describe("persisted appearance format", () => {
  it("keeps legacy presets valid and round-trips every part independently", () => {
    for (let id = 0; id < 4; id++) {
      const original = decodeAppearance(id);
      expect(decodeAppearance(encodeAppearance(original))).toEqual(original);
    }
    for (const part of appearanceParts) {
      for (let value = 0; value < appearanceOptions[part].length; value++) {
        const appearance = { ...decodeAppearance(0), [part]: value };
        expect(decodeAppearance(encodeAppearance(appearance))).toEqual(
          appearance,
        );
      }
    }
    expect(encodeAppearance(decodeAppearance(MAX_AVATAR_ID))).toBe(
      MAX_AVATAR_ID,
    );
  });
  it("accepts customised profiles through guest and setup contracts, rejects invalid IDs", () => {
    const profile = {
      name: "Riya",
      avatar: MAX_AVATAR_ID,
      color: avatarColors[4],
    };
    expect(GuestSchema.parse(profile)).toEqual(profile);
    expect(
      SetupSchema.parse({ ...profile, mode: "remote", spice: "mild" }).avatar,
    ).toBe(MAX_AVATAR_ID);
    for (const avatar of [-1, 1.5, MAX_AVATAR_ID + 1])
      expect(GuestSchema.safeParse({ ...profile, avatar }).success).toBe(false);
  });
  it("renders only trusted markup even with malformed appearance input", () => {
    expect(avatarSvg(4, '\"><script>alert(1)</script>')).not.toContain(
      "<script>",
    );
    expect(avatarSvg(NaN)).toBe(avatarSvg(0));
    expect(() =>
      encodeAppearance({ ...decodeAppearance(0), hair: 999 }),
    ).toThrow();
    for (const part of appearanceParts) {
      const variants = appearanceOptions[part].map((_, index) =>
        avatarSvg(encodeAppearance({ ...decodeAppearance(0), [part]: index })),
      );
      expect(new Set(variants).size).toBe(variants.length);
    }
  });
});
