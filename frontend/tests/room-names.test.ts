import { expect, it } from "vitest";
import { roomNames } from "@expose/shared/game/room-names";
it("labels duplicate names by seat order without colliding with literal numbered names", () => {
  expect(roomNames(["Alex", "alex", "Mira"])).toEqual([
    "Alex 1",
    "alex 2",
    "Mira",
  ]);
  const labels = roomNames(["Sam", " Sam ", "Sam 1", "SAM", "Ｓａｍ"]);
  expect(new Set(labels.map((label) => label.toLowerCase())).size).toBe(5);
  expect(labels).toEqual(["Sam 2", "Sam 3", "Sam 1", "SAM 4", "Sam 5"]);
  expect(
    roomNames(["a".repeat(24), "a".repeat(24)]).every(
      (name) => name.length <= 24,
    ),
  ).toBe(true);
});
