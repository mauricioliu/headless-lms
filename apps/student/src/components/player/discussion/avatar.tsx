import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";

/** The one avatar the discussion draws. Sizes are the two the layout uses:
 *  a root comment and the smaller one a reply or composer sits behind. */
export function CommentAvatar({
  name,
  image = null,
  size = "md",
  className,
}: {
  name: string;
  image?: string | null;
  size?: "md" | "sm";
  className?: string;
}) {
  const box = size === "md" ? "size-9" : "size-7";
  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- avatars are remote and unsized
      <img
        src={image}
        alt=""
        className={cn(box, "shrink-0 rounded-full object-cover", className)}
      />
    );
  }
  return (
    <span
      className={cn(
        box,
        "grid shrink-0 place-items-center rounded-full bg-surface-warm-2 font-semibold text-ink-3",
        size === "md" ? "text-[11px]" : "text-[10px]",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
