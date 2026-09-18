"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState } from "react";
import {
  AlertCircle,
  Download,
  ImageIcon,
  LoaderCircle,
  Maximize,
  Minimize,
  Sparkles,
  Trash2,
} from "lucide-react";
import styles from "./RenderResult.module.css";
import type { OutputDetails } from "@/lib/api";

type RenderResultProps = {
  result: { url: string; name: string; width?: number; height?: number; details?: OutputDetails } | null;
  isRendering: boolean;
  onRemove: () => void;
  onDownload: () => void;
  isDownloading: boolean;
};

export default function RenderResult({
  result,
  isRendering,
  onRemove,
  onDownload,
  isDownloading,
}: RenderResultProps) {
  const titleId = useId();
  const cardRef = useRef<HTMLElement>(null);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState("");
  const hasImageError = Boolean(result && failedUrl === result.url);

  useEffect(() => {
    function handleFullscreenChange() {
      setFullscreen(document.fullscreenElement === cardRef.current);
      setFullscreenError("");
    }
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  async function toggleFullscreen() {
    setFullscreenError("");
    try {
      if (document.fullscreenElement === cardRef.current) {
        await document.exitFullscreen();
      } else if (cardRef.current?.requestFullscreen) {
        await cardRef.current.requestFullscreen();
      } else {
        setFullscreenError("Trình duyệt này chưa hỗ trợ chế độ toàn màn hình.");
      }
    } catch {
      setFullscreenError("Không thể đổi chế độ toàn màn hình. Vui lòng thử lại.");
    }
  }

  async function removeResult() {
    setFullscreenError("");
    if (document.fullscreenElement === cardRef.current) {
      try {
        await document.exitFullscreen();
      } catch {
        setFullscreenError("Nhấn Esc hoặc nút thu nhỏ để thoát toàn màn hình.");
      }
    }
    onRemove();
  }

  return (
    <section ref={cardRef} className={styles.card} aria-labelledby={titleId}>
      <div className={styles.header}>
        <div className={styles.heading}>
          <Sparkles size={17} aria-hidden="true" />
          <h2 id={titleId}>Ảnh Render</h2>
          {result && !isRendering && <span className={styles.resultBadge}>Kết quả</span>}
        </div>
        <div className={styles.actions}>
          {result || fullscreen ? (
            <>
              <button
                type="button"
                className={`button button-secondary ${styles.downloadButton}`}
                onClick={onDownload}
                disabled={!result || isRendering || isDownloading}
                aria-label={isDownloading ? "Đang tải ảnh về" : "Tải phối cảnh về máy"}
              >
                {isDownloading ? (
                  <LoaderCircle size={15} className={styles.spinner} aria-hidden="true" />
                ) : (
                  <Download size={15} aria-hidden="true" />
                )}
                {isDownloading ? "Đang tải…" : "Tải về"}
              </button>
              <button
                type="button"
                className={styles.iconButton}
                onClick={() => void toggleFullscreen()}
                disabled={!fullscreen && (!result || hasImageError)}
                aria-label={
                  fullscreen ? "Thoát toàn màn hình" : "Xem phối cảnh toàn màn hình"
                }
                aria-pressed={fullscreen}
                title={fullscreen ? "Thoát toàn màn hình (Esc)" : "Toàn màn hình"}
              >
                {fullscreen ? (
                  <Minimize size={16} aria-hidden="true" />
                ) : (
                  <Maximize size={16} aria-hidden="true" />
                )}
              </button>
              <button
                type="button"
                className={`${styles.iconButton} ${styles.removeButton}`}
                onClick={() => void removeResult()}
                disabled={!result || isRendering || isDownloading}
                aria-label="Xóa phối cảnh"
                title="Xóa phối cảnh"
              >
                <Trash2 size={15} aria-hidden="true" />
              </button>
            </>
          ) : (
            <span className={styles.actionsHint}>Kết quả để đối chiếu với ảnh gốc</span>
          )}
        </div>
      </div>

      <div
        className={`${styles.imageViewport} ${!result ? styles.emptyViewport : ""}`}
        aria-busy={isRendering}
      >
        {result ? (
          <>
            <Image
              key={result.url}
              src={result.url}
              alt={`Phối cảnh: ${result.name}`}
              fill
              unoptimized
              sizes={fullscreen ? "100vw" : "(max-width: 700px) 100vw, 50vw"}
              className={styles.image}
              onError={() => setFailedUrl(result.url)}
              onLoad={() => setFailedUrl(null)}
            />
            {hasImageError && (
              <div className={styles.imageError} role="alert">
                <AlertCircle size={24} aria-hidden="true" />
                <p>Không thể hiển thị phối cảnh. Bạn có thể thử tải ảnh xuống.</p>
              </div>
            )}
            <div className={styles.caption}>
              <span className={styles.fileName} title={result.name}>
                <ImageIcon size={12} aria-hidden="true" />
                <span>{result.name}</span>
              </span>
              {Boolean(result.width && result.height) && (
                <span className={styles.dimensions}>
                  {result.width} × {result.height}
                </span>
              )}
            </div>
          </>
        ) : (
          <div className={styles.emptyState}>
            <span className={styles.emptyIcon}>
              {isRendering ? (
                <LoaderCircle size={26} className={styles.spinner} aria-hidden="true" />
              ) : (
                <ImageIcon size={26} strokeWidth={1.5} aria-hidden="true" />
              )}
            </span>
            <div role={isRendering ? "status" : undefined}>
              <h3>{isRendering ? "Đang dựng phối cảnh" : "Chưa có phối cảnh"}</h3>
              <p>
                {isRendering
                  ? "Phối cảnh sẽ hiển thị tại đây khi hoàn tất."
                  : "Cung cấp hiện trạng và chỉ dẫn, sau đó nhấn Dựng phối cảnh."}
              </p>
            </div>
          </div>
        )}
        {fullscreenError ? (
          <div className={`${styles.viewportNotice} ${styles.errorNotice}`} role="alert">
            <AlertCircle size={15} aria-hidden="true" />
            <span>{fullscreenError}</span>
          </div>
        ) : (
          result &&
          isRendering && (
            <div className={styles.viewportNotice} role="status">
              <LoaderCircle size={15} className={styles.spinner} aria-hidden="true" />
              <span>Đang dựng phối cảnh mới… Kết quả trước vẫn được giữ lại.</span>
            </div>
          )
        )}
      </div>
      {result?.details?.native_size && <p className="output-details">Ảnh AI: {result.details.native_size} → xuất: {result.width} × {result.height}{result.details.upscaled ? " · Đã phóng lớn, không phải độ phân giải AI gốc" : ""}{result.details.cropped ? " · Đã cắt giữa ảnh để đúng tỷ lệ" : ""}</p>}
    </section>
  );
}
