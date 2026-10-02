import Link from "next/link";
import CopyButton from "@/app/copy-button";

type EntityLinkProps = {
  href: string;
  value: string;
  label: string;
  displayValue?: string;
  copyValue?: string;
  mono?: boolean;
  className?: string;
};

export default function EntityLink({
  href,
  value,
  label,
  displayValue,
  copyValue,
  mono = true,
  className,
}: EntityLinkProps) {
  const classes = ["entity-link", mono ? "mono" : "", className ?? ""]
    .filter(Boolean)
    .join(" ");

  return (
    <span className="entity-line">
      <Link href={href} className={classes} title={value}>
        {displayValue ?? value}
      </Link>
      <CopyButton value={copyValue ?? value} label={`Copy ${label}`} compact />
    </span>
  );
}
