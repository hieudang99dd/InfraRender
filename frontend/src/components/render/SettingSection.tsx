import { ChevronDown } from "lucide-react";
import { type ReactNode, useId, useState } from "react";

import styles from "./SettingSection.module.css";

type SettingSectionProps = {
  title: string;
  description?: string;
  icon?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
};

export default function SettingSection({
  title,
  description,
  icon,
  defaultOpen = false,
  children,
}: SettingSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();

  return (
    <section className={styles.section}>
      <h3 className={styles.heading}>
        <button
          id={`${id}-trigger`}
          type="button"
          aria-expanded={open}
          aria-controls={`${id}-content`}
          onClick={() => setOpen((value) => !value)}
          className={styles.trigger}
        >
          <span className={styles.icon} aria-hidden="true">
            {icon}
          </span>
          <span className={styles.title}>{title}</span>
          <ChevronDown
            size={15}
            className={`${styles.chevron} ${open ? styles.open : ""}`}
            aria-hidden="true"
          />
        </button>
      </h3>
      <div
        id={`${id}-content`}
        aria-labelledby={`${id}-trigger`}
        className={styles.content}
        hidden={!open}
      >
        {description && <p className={styles.description}>{description}</p>}
        {children}
      </div>
    </section>
  );
}
