import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { exportSections, type BookingExport } from "./bookingExport";

export async function bookingExportPdf(data: BookingExport) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const response = await fetch("/fonts/export-sans.ttf");
  if (!response.ok) throw new Error("Export font unavailable");
  const font = await pdf.embedFont(await response.arrayBuffer(), { subset: true });
  pdf.setTitle(`Onic Car Rentals — booking ${data.booking_id}`);
  let page = pdf.addPage([595, 842]), y = 780;
  const newPage = () => { page = pdf.addPage([595, 842]); y = 780; };
  const wrap = (value: string, maxWidth: number, size: number) => {
    const lines: string[] = []; let line = "";
    for (const word of value.replace(/[\r\n]/g, " ").split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) { lines.push(line); line = ""; }
      if (font.widthOfTextAtSize(word, size) > maxWidth) {
        for (const char of word) {
          if (font.widthOfTextAtSize(line + char, size) > maxWidth && line) { lines.push(line); line = ""; }
          line += char;
        }
      } else line = line ? `${line} ${word}` : word;
    }
    if (line) lines.push(line);
    return lines.length ? lines : ["—"];
  };
  page.drawText("ONIC CAR RENTALS", { x: 42, y, font, size: 20 }); y -= 28;
  page.drawText("Private booking export · Reoli LLC", { x: 42, y, font, size: 10 }); y -= 28;
  for (const section of exportSections(data)) {
    if (y < 95) newPage();
    page.drawText(section.title.toUpperCase(), { x: 42, y, font, size: 12 }); y -= 24;
    for (const [label, value] of section.rows) {
      const labels = wrap(label, 175, 8.5), values = wrap(value, 310, 9);
      const height = Math.max(labels.length, values.length) * 13 + 9;
      if (y - height < 48) newPage();
      labels.forEach((l, i) => page.drawText(l, { x: 42, y: y - i * 13, font, size: 8.5, color: rgb(.32, .32, .32) }));
      values.forEach((v, i) => page.drawText(v, { x: 225, y: y - i * 13, font, size: 9 }));
      y -= height;
    }
    y -= 14;
  }
  pdf.getPages().forEach((p, i) => p.drawText(`Private · ${i + 1} / ${pdf.getPageCount()}`, { x: 42, y: 24, font, size: 8 }));
  return new Blob([new Uint8Array(await pdf.save())], { type: "application/pdf" });
}