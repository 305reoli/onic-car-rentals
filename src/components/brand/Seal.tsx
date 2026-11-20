import { cn } from "@/lib/utils";

/** Official Onic Car Rentals seal. Sizes map to pre-resized files in /public/brand (1x + 2x, webp + png). */
const SIZES = { 32: 64, 36: 72, 40: 80, 44: 88, 72: 144 } as const;
export type SealSize = keyof typeof SIZES;

export function Seal({ size, className, priority }: { size: SealSize; className?: string; priority?: boolean }) {
  const x2 = SIZES[size];
  return (
    <picture className={cn("inline-block shrink-0", className)} style={{ width: size, height: size }}>
      <source type="image/webp" srcSet={`/brand/seal-${size}.webp 1x, /brand/seal-${x2}.webp 2x`} />
      <img
        src={`/brand/seal-${size}.png`}
        srcSet={`/brand/seal-${size}.png 1x, /brand/seal-${x2}.png 2x`}
        width={size}
        height={size}
        alt="Onic Car Rentals"
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        className="block size-full"
      />
    </picture>
  );
}
