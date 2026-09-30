type MaterialIconProps = {
  name: string;
  className?: string;
  title?: string;
};

export default function MaterialIcon({ name, className, title }: MaterialIconProps) {
  return (
    <span
      className={className ? `material-symbols-rounded ${className}` : "material-symbols-rounded"}
      aria-hidden={title ? undefined : "true"}
      title={title}
    >
      {name}
    </span>
  );
}
