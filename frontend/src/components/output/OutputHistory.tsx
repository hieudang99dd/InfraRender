"use client";

import { useState } from "react";
import { ArrowUpRight, FileText, History, Star, Trash2, Image as ImageIcon, Download } from "lucide-react";
import type { PromptVersion, RenderVersion } from "@/lib/workspace";

type OutputHistoryProps = {
  versions: PromptVersion[];
  renderVersions: RenderVersion[];
  activeVersion: string | null;
  onRestore: (version: PromptVersion) => void;
  onToggleFavorite: (id: string) => void;
  onDelete: (id: string) => void;
  onDeleteRender: (id: string) => void;
  onRestoreRender: (version: RenderVersion) => void;
};

export default function OutputHistory({
  versions,
  renderVersions,
  activeVersion,
  onRestore,
  onToggleFavorite,
  onDelete,
  onDeleteRender,
  onRestoreRender,
}: OutputHistoryProps) {
  const [activeTab, setActiveTab] = useState<"prompt" | "render">("prompt");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const visibleVersions = favoritesOnly ? versions.filter((version) => version.favorite) : versions;

  async function handleDownloadRender(version: RenderVersion, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      const response = await fetch(version.url);
      if (!response.ok) return;
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = version.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {}
  }

  return (
    <section className="panel history-panel" aria-labelledby="history-title">
      <div className="panel-heading history-heading" style={{ paddingBottom: '0', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
          <div className="section-title">
            <span className="section-icon">
              <History size={17} />
            </span>
            <h2 id="history-title">Lịch sử</h2>
          </div>
          {activeTab === "prompt" && (
            <button
              type="button"
              className={`text-button ${favoritesOnly ? "accent-text" : ""}`}
              aria-pressed={favoritesOnly}
              onClick={() => setFavoritesOnly((current) => !current)}
            >
              <Star size={13} fill={favoritesOnly ? "currentColor" : "none"} />
              Yêu thích
            </button>
          )}
        </div>
        <div className="history-tabs" style={{ display: 'flex', width: '100%', gap: '20px' }}>
          <button 
            onClick={() => setActiveTab("prompt")}
            style={{ padding: '12px 0', background: 'none', border: 'none', borderBottom: activeTab === 'prompt' ? '2px solid var(--accent)' : '2px solid transparent', color: activeTab === 'prompt' ? 'var(--foreground)' : 'var(--muted)', fontSize: '13px', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            Chỉ dẫn đã lưu <span className="count-badge">{versions.length}</span>
          </button>
          <button 
            onClick={() => setActiveTab("render")}
            style={{ padding: '12px 0', background: 'none', border: 'none', borderBottom: activeTab === 'render' ? '2px solid var(--accent)' : '2px solid transparent', color: activeTab === 'render' ? 'var(--foreground)' : 'var(--muted)', fontSize: '13px', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            Phối cảnh đã dựng <span className="count-badge">{renderVersions?.length || 0}</span>
          </button>
        </div>
      </div>

      {activeTab === "prompt" ? (
        visibleVersions.length ? (
          <div className="version-list">
            {visibleVersions.map((version) => (
              <article
                className={`version-card ${activeVersion === version.id ? "is-active" : ""}`}
                key={version.id}
              >
                <div className="version-topline">
                  <span>
                    <FileText size={14} />
                    {new Date(version.createdAt).toLocaleTimeString("vi-VN", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <div className="version-controls">
                    <button
                      type="button"
                      className="version-star"
                      onClick={() => onToggleFavorite(version.id)}
                    >
                      <Star size={15} fill={version.favorite ? "currentColor" : "none"} />
                    </button>
                    <button
                      type="button"
                      className="version-delete"
                      onClick={() => onDelete(version.id)}
                    >
                      <Trash2 size={13} />
                      <span>Xóa</span>
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  className="version-restore"
                  onClick={() => onRestore(version)}
                >
                  <strong>{version.sourceName}</strong>
                  <p>{version.prompt}</p>
                  <span>
                    {activeVersion === version.id ? "Đang xem phiên bản" : "Mở phiên bản"}
                    <ArrowUpRight size={13} />
                  </span>
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className="history-empty">
            <span className="history-empty-icon">
              <History size={17} strokeWidth={1.5} />
            </span>
            <div>
              <strong>Chưa có chỉ dẫn nào được lưu</strong>
              <p>Mỗi chỉ dẫn phối cảnh bạn lưu sẽ hiển thị ở đây để xem lại và khôi phục.</p>
            </div>
          </div>
        )
      ) : (
        /* Lịch sử kết xuất */
        renderVersions?.length ? (
          <div className="version-list" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {renderVersions.map((version) => (
              <article key={version.id} style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '12px', background: 'var(--surface-2)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <ImageIcon size={13} />
                    {new Date(version.createdAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={(e) => handleDownloadRender(version, e)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: '4px' }} title="Tải ảnh về">
                      <Download size={14} />
                    </button>
                    <button onClick={() => onDeleteRender(version.id)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: '4px' }} title="Xóa phối cảnh">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <div style={{ width: '80px', height: '60px', position: 'relative', borderRadius: '4px', overflow: 'hidden', flexShrink: 0, backgroundColor: 'var(--background)' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={version.url} alt="Phối cảnh thu nhỏ" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                  <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                    <p style={{ fontSize: '11px', color: 'var(--foreground)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: '1.4' }}>
                      {version.prompt}
                    </p>
                    <button onClick={() => onRestoreRender(version)} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: 'var(--accent)', fontSize: '11px', padding: 0, display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontWeight: 500 }}>
                      Khôi phục <ArrowUpRight size={11} />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="history-empty" style={{ margin: '20px' }}>
            <span className="history-empty-icon">
              <ImageIcon size={17} strokeWidth={1.5} />
            </span>
            <div>
              <strong>Chưa có phối cảnh nào</strong>
              <p>Các phối cảnh sau khi dựng thành công sẽ được lưu trữ tại đây.</p>
            </div>
          </div>
        )
      )}
    </section>
  );
}
