import { Box, ChevronRight, Download, Pencil, RotateCcw } from "lucide-react";
import BackendStatus from "@/components/BackendStatus";

type HeaderProps = {
  projectName: string;
  onProjectNameChange: (name: string) => void;
  onRefresh: () => void;
  onExport: () => void;
  canExport: boolean;
};

export default function Header({
  projectName,
  onProjectNameChange,
  onRefresh,
  onExport,
  canExport,
}: HeaderProps) {
  return (
    <header className="app-header">
      <a className="brand" href="#workspace" aria-label="InfraRender AI — Không gian làm việc">
        <span className="brand-mark">
          <Box size={23} strokeWidth={1.6} />
        </span>
        <span className="brand-name">
          InfraRender<span>AI STUDIO</span>
        </span>
      </a>

      <div className="project-breadcrumb">
        <span>Không gian làm việc</span>
        <ChevronRight size={14} />
        <label className="project-name-field">
          <span className="sr-only">Tên dự án</span>
          <input
            aria-label="Tên dự án"
            value={projectName}
            maxLength={70}
            onChange={(event) => onProjectNameChange(event.target.value)}
            onBlur={() => {
              if (!projectName.trim()) onProjectNameChange("Dự án hạ tầng mới");
            }}
          />
          <Pencil size={12} />
        </label>
      </div>

      <div className="header-actions">
        <button
          type="button"
          className="button refresh-button"
          onClick={onRefresh}
          title="Bắt đầu dự án mới"
          aria-label="Bắt đầu dự án mới"
        >
          <RotateCcw size={15} />
          <span>Dự án mới</span>
        </button>

        <BackendStatus />

        <button
          type="button"
          className="button button-secondary export-button"
          onClick={onExport}
          disabled={!canExport}
          title={!canExport ? "Cần có chỉ dẫn phối cảnh để xuất file" : "Xuất chỉ dẫn phối cảnh ra file văn bản"}
        >
          <Download size={15} />
          <span>Xuất chỉ dẫn</span>
        </button>
      </div>
    </header>
  );
}
