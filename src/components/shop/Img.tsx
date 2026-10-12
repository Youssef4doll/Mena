import Image from "next/image";
import type { ImageRef } from "@/lib/catalog";

/** A product picture from /api/img, with its blurred preview while it loads. */
export function Img({
  image,
  alt,
  sizes,
  priority = false,
  className = "",
  fill = true,
}: {
  image: Pick<ImageRef, "id" | "blur" | "width" | "height"> | null;
  alt: string;
  sizes: string;
  priority?: boolean;
  className?: string;
  fill?: boolean;
}) {
  if (!image) return <Placeholder className={className} />;
  const common = {
    src: `/api/img/${image.id}`,
    alt,
    sizes,
    priority,
    className: `object-cover ${className}`,
    ...(image.blur ? { placeholder: "blur" as const, blurDataURL: image.blur } : {}),
  };
  return fill ? <Image {...common} fill alt={alt} /> : <Image {...common} width={image.width} height={image.height} alt={alt} />;
}

export function Placeholder({ className = "" }: { className?: string }) {
  return (
    <div className={`absolute inset-0 flex items-center justify-center bg-sand ${className}`} aria-hidden>
      <svg viewBox="0 0 40 48" className="h-10 w-10 text-sand-2" fill="currentColor">
        <path d="M20 0C9 0 0 9 0 20v28h40V20C40 9 31 0 20 0Z" />
      </svg>
    </div>
  );
}
