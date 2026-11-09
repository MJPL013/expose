import Image from "next/image";
/** Original supplied artwork, cropped without its decorative corner sparkle. */
export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Image
      src="/brand/expose-lockup.png"
      alt="Expose"
      data-brand-logo
      width={compact ? 98 : 128}
      height={compact ? 24 : 32}
      unoptimized
      priority
      style={{ display: "block", objectFit: "contain", flexShrink: 0 }}
    />
  );
}
