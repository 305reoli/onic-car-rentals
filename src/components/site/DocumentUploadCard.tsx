import { useEffect, useRef, useState } from "react";
import { Camera, Check, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { checkoutPackageText, type Lang } from "@/lib/i18n";

export function DocumentUploadCard({ label, file, lang, onFile, busy, status, disabled, accept = "image/jpeg,image/png,image/heic,image/heif,.heic,.heif" }: { accept?: string; label: string; file?: File | undefined; lang: Lang; onFile: (file: File) => void; busy: boolean; status?: string | undefined; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null), camera = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState("");
  const t = checkoutPackageText[lang];
  useEffect(() => { if (!file || !file.type.startsWith("image/")) { setPreview(""); return; } const url = URL.createObjectURL(file); setPreview(url); return () => URL.revokeObjectURL(url); }, [file]);
  const select = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; };
  return <article className="document-upload overflow-hidden rounded-2xl border border-border bg-card" data-testid="document-upload-card">
    <div className="document-heading flex items-center justify-between gap-3 p-4 font-semibold"><span>{label}</span>{file && <Check className="size-5 shrink-0 text-success" />}</div>
    <Button type="button" variant="ghost" disabled={disabled} className="document-preview h-36 w-full rounded-none bg-secondary" onClick={() => input.current?.click()} aria-label={`${t.upload} ${label}`}>
      {preview ? <img src={preview} alt={label} className="h-full w-full object-contain" /> : file ? <span className="truncate px-4 text-sm">{file.name}</span> : <Upload className="size-9 text-muted-foreground" />}
    </Button>
    <div className="document-actions grid grid-cols-2 gap-3 p-4"><Button type="button" variant="outline" disabled={disabled} onClick={() => camera.current?.click()}><Camera className="size-4" />{file ? t.retake : t.camera}</Button><Button type="button" variant="outline" disabled={disabled} onClick={() => input.current?.click()}><Upload className="size-4" />{t.upload}</Button></div>
    {status && <p role="status" className="document-status px-4 pb-4 text-sm text-muted-foreground">{busy ? t.checking : status}</p>}
    <input ref={input} disabled={disabled} type="file" className="hidden" accept={accept} onChange={select} aria-label={label} />
    <input ref={camera} disabled={disabled} type="file" className="hidden" accept="image/*" capture="environment" onChange={select} aria-label={`${t.camera} ${label}`} />
  </article>;
}