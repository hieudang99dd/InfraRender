import type { ReactNode } from "react";

import styles from "./OptionChip.module.css";

type OptionChipProps = {
  label: string;
  active?: boolean;
  icon?: ReactNode;
  onClick: () => void;
};

export default function OptionChip({ label, active = false, icon, onClick }: OptionChipProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`${styles.chip} ${active ? styles.active : ""}`}
    >
      {icon && (
        <span className={styles.icon} aria-hidden="true">
          {icon}
        </span>
      )}
      {label}
    </button>
  );
}
