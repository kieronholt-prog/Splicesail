import { marineFlagPublicSrc } from "@/lib/marine-signal-flags";

type Props = {
  flagKey: string;
  alt?: string;
  className?: string;
};

export function MarineSignalFlagImg({ flagKey, alt = "", className }: Props) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- small static SVGs in /public
    <img src={marineFlagPublicSrc(flagKey)} alt={alt} className={className} draggable={false} />
  );
}
