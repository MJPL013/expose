import type { FriendCard } from "@expose/shared/game/contracts";
import { avatarSvg } from "@expose/shared/game/appearance";

async function loadImage(source: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = source;
  await image.decode();
  return image;
}

export interface ArtifactService {
  prepareCard(card: FriendCard, approved: boolean): Promise<File>;
  prepareRapSheet(
    card: FriendCard,
    scores: { name: string; score: number }[],
    approved: boolean,
  ): Promise<File>;
  downloadCard(card: FriendCard, approved: boolean): Promise<void>;
  downloadRapSheet(
    card: FriendCard,
    scores: { name: string; score: number }[],
    approved: boolean,
  ): Promise<void>;
}
function wrap(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
) {
  let line = "";
  // Segment long words as well as ordinary prose so exported user text cannot escape the sheet.
  for (const char of Array.from(value)) {
    if (ctx.measureText(line + char).width > maxWidth && line) {
      ctx.fillText(line.trim(), x, y);
      y += lineHeight;
      line = "";
    }
    line += char;
  }
  if (line) ctx.fillText(line.trim(), x, y);
  return y + lineHeight;
}
async function canvas() {
  await document.fonts.ready;
  const element = document.createElement("canvas");
  element.width = 1080;
  element.height = 1600;
  const ctx = element.getContext("2d");
  if (!ctx) throw new Error("Image export is unavailable in this browser.");
  ctx.fillStyle = "#0e0d12";
  ctx.fillRect(0, 0, 1080, 1600);
  ctx.fillStyle = "#f4efe6";
  ctx.beginPath();
  ctx.roundRect(40, 40, 1000, 1520, 42);
  ctx.fill();
  ctx.fillStyle = "#141318";
  ctx.font = '700 25px "DM Sans Variable", sans-serif';
  ctx.drawImage(await loadImage("/brand/expose-logo.png"), 90, 62, 112, 72);
  ctx.fillText("SQUAD VERIFIED", 230, 110);
  return { ctx, element };
}
async function prepareFile(element: HTMLCanvasElement, filename: string) {
  const blob = await new Promise<Blob>((resolve, reject) =>
    element.toBlob(
      (b) =>
        b ? resolve(b) : reject(new Error("Could not create the image.")),
      "image/png",
    ),
  );
  return new File([blob], filename, { type: "image/png" });
}
export function downloadArtifact(file: File) {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function guard(approved: boolean) {
  if (!approved)
    throw new Error("Approve your card before downloading an artifact.");
}
export const pngArtifacts: ArtifactService = {
  async downloadCard(card, approved) {
    downloadArtifact(await pngArtifacts.prepareCard(card, approved));
  },
  async downloadRapSheet(card, scores, approved) {
    downloadArtifact(
      await pngArtifacts.prepareRapSheet(card, scores, approved),
    );
  },
  async prepareCard(card, approved) {
    guard(approved);
    const { ctx, element } = await canvas();
    ctx.font = '800 72px "Bricolage Grotesque Variable", sans-serif';
    let y = wrap(ctx, card.name, 90, 240, 900, 82);
    const avatar = await loadImage(
      `data:image/svg+xml;charset=utf-8,${encodeURIComponent(avatarSvg(card.avatar, card.color))}`,
    );
    ctx.save();
    ctx.beginPath();
    ctx.arc(540, y + 160, 140, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(avatar, 400, y + 20, 280, 280);
    ctx.restore();
    ctx.fillStyle = "#141318";
    y += 365;
    ctx.font = "64px Anton, sans-serif";
    y = wrap(ctx, card.title, 90, y, 900, 74) + 30;
    for (const trait of card.traits) {
      ctx.font = '500 28px "DM Sans Variable", sans-serif';
      ctx.fillText(trait.label.toUpperCase(), 90, y);
      ctx.fillStyle = "#d5cec0";
      ctx.fillRect(90, y + 20, 900, 14);
      ctx.fillStyle = "#141318";
      ctx.fillRect(90, y + 20, (900 * trait.value) / 100, 14);
      y += 100;
    }
    ctx.font = 'italic 26px "DM Sans Variable", sans-serif';
    wrap(ctx, `“${card.quote}”`, 90, y + 15, 900, 36);
    ctx.font = '700 23px "DM Sans Variable", sans-serif';
    ctx.fillText("APPROVED BY SUBJECT", 90, 1465);
    ctx.fillText(card.caseId, 90, 1510);
    return prepareFile(element, "expose-friend-card.png");
  },
  async prepareRapSheet(card, scores, approved) {
    guard(approved);
    const { ctx, element } = await canvas();
    ctx.font = "100px Anton, sans-serif";
    ctx.fillText("THE RAP SHEET", 90, 280);
    ctx.font = '500 32px "DM Sans Variable", sans-serif';
    ctx.fillText("Your squad / Final standings", 90, 350);
    scores.forEach((p, i) => {
      const y = 480 + i * Math.min(170, 700 / Math.max(1, scores.length));
      ctx.font = '800 44px "Bricolage Grotesque Variable", sans-serif';
      ctx.fillText(
        `${scores.findIndex((x) => x.score === p.score) + 1}. ${p.name}`,
        90,
        y,
        700,
      );
      ctx.textAlign = "right";
      ctx.fillText(`${p.score}`, 990, y);
      ctx.textAlign = "left";
      ctx.strokeStyle = "#c2b8a4";
      ctx.beginPath();
      ctx.moveTo(90, y + 50);
      ctx.lineTo(990, y + 50);
      ctx.stroke();
    });
    ctx.fillStyle = "#aa2525";
    ctx.font = "90px Anton, sans-serif";
    ctx.save();
    ctx.translate(145, 1320);
    ctx.rotate(-0.07);
    ctx.fillText("CASE CLOSED", 0, 0);
    ctx.restore();
    ctx.fillStyle = "#141318";
    ctx.font = '500 25px "DM Sans Variable", sans-serif';
    ctx.fillText("Your squad. Under oath.", 90, 1440);
    ctx.fillText(card.caseId, 90, 1500);
    return prepareFile(element, "expose-rap-sheet.png");
  },
};
