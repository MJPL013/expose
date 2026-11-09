import type { Persona } from "@expose/shared/gc2";

export async function prepareCard(persona: Persona): Promise<File> {
  await document.fonts.ready;
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Image creation is unavailable.");
  ctx.fillStyle = "#100e13";
  ctx.fillRect(0, 0, 1080, 1350);
  const rim = ctx.createLinearGradient(360, 100, 700, 450);
  rim.addColorStop(0, "#ffce80");
  rim.addColorStop(0.5, "#654016");
  rim.addColorStop(1, "#ffb020");
  ctx.strokeStyle = rim;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(540, 260, 125, 0, Math.PI * 2);
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffca69";
  ctx.font = '500 24px "DM Sans Variable", sans-serif';
  ctx.fillText("THE VOID / EXPOSE", 540, 470);
  const wrapped = (text: string, size: number, maxWidth: number) => {
    ctx.font = `500 ${size}px "Bricolage Grotesque Variable", "Noto Sans Devanagari Variable", sans-serif`;
    const parts = text.split(/\s+/u),
      lines: string[] = [];
    let line = "";
    for (const word of parts) {
      if (
        ctx.measureText((line ? line + " " : "") + word).width > maxWidth &&
        line
      ) {
        lines.push(line);
        line = "";
      }
      if (ctx.measureText(word).width > maxWidth) {
        for (const char of word) {
          if (ctx.measureText(line + char).width > maxWidth) {
            lines.push(line);
            line = "";
          }
          line += char;
        }
      } else line += (line ? " " : "") + word;
    }
    if (line) lines.push(line);
    return lines;
  };
  let size = 64,
    lines = wrapped(persona.quote, size, 870);
  while (lines.length * size * 1.25 > 440 && size > 34) {
    size -= 2;
    lines = wrapped(persona.quote, size, 870);
  }
  ctx.fillStyle = "#f4efe6";
  lines.forEach((line, i) => ctx.fillText(line, 540, 600 + i * size * 1.25));
  ctx.fillStyle = "#ffca69";
  const titles = wrapped(persona.title, 36, 870);
  titles
    .slice(0, 3)
    .forEach((line, i) => ctx.fillText(line, 540, 1090 + i * 45));
  ctx.fillStyle = "#aaa5b5";
  ctx.font = '400 22px "DM Sans Variable", sans-serif';
  ctx.fillText("AI-written. Inspired by my stories.", 540, 1250);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Couldn't prepare the card."))),
      "image/png",
    ),
  );
  return new File([blob], "the-void.png", { type: "image/png" });
}
export function downloadCard(file: File) {
  const url = URL.createObjectURL(file),
    anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
