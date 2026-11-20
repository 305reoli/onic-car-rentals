// Shared HTML shell for every booking/confirmation email (EN/PT/ES): official seal (72px, hosted
// transparent PNG at 2x) centered on the dark header, so no white square appears behind it.
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function emailHtml(o: { siteUrl: string; lang: "en" | "pt" | "es"; subject: string; lines: string[]; link?: string | undefined; linkLabel?: string | undefined; footer?: string | undefined; photo?: string | undefined; gallery?: string[] | undefined; actions?: { label: string; href: string }[] | undefined }) {
  const seal = `${o.siteUrl.replace(/\/$/, "")}/brand/seal-144.png`;
  const body = o.lines.filter(Boolean).map((l) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#F5F3EF">${esc(l)}</p>`).join("");
  const photo = o.photo ? `<img src="${esc(o.photo)}" alt="" width="496" style="display:block;width:100%;aspect-ratio:3/2;object-fit:cover;margin:0 0 16px" />` : "";
  const gallery = (o.gallery ?? []).length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px"><tr>${(o.gallery ?? []).map((u) => `<td style="padding:0 4px"><img src="${esc(u)}" alt="" width="160" style="display:block;width:100%;aspect-ratio:3/2;object-fit:cover" /></td>`).join("")}</tr></table>` : "";
  const actions = (o.actions ?? []).map((a) => `<a href="${esc(a.href)}" style="display:inline-block;padding:12px 18px;margin:6px;border:1px solid #D4B27A;color:#F5F3EF;text-decoration:none;border-radius:999px">${esc(a.label)}</a>`).join("");
  const btn = o.link ? `<p style="margin:24px 0"><a href="${esc(o.link)}" style="display:inline-block;background:#D4B27A;color:#0A0A0B;text-decoration:none;font-weight:600;padding:12px 24px;border-radius:999px">${esc(o.linkLabel ?? o.link)}</a></p>` : "";
  return `<!doctype html><html lang="${o.lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(o.subject)}</title></head>
<body style="margin:0;background:#0A0A0B;font-family:Inter,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0A0A0B"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#141416;border:1px solid #222226;border-radius:20px">
<tr><td align="center" style="padding:32px 24px 8px"><img src="${seal}" width="72" height="72" alt="Sua Locadora" style="display:block;width:72px;height:72px;border:0"></td></tr>
<tr><td style="padding:16px 32px 32px"><h1 style="margin:0 0 18px;font-family:Archivo,Arial,sans-serif;font-weight:700;font-size:26px;color:#F5F3EF">${esc(o.subject)}</h1>${photo}${gallery}${body}${actions}${btn}
${o.footer ? `<p style="margin:24px 0 0;font-size:13px;color:#A3A3A8">${esc(o.footer)}</p>` : ""}</td></tr></table>
<p style="margin:16px 0 0;font-size:12px;color:#A3A3A8">Sua Locadora · Sua Empresa LLC</p></td></tr></table></body></html>`;
}
