"use client";

import Image from "next/image";
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type PointerEvent,
} from "react";
import {
  AlertCircle,
  Expand,
  ImageIcon,
  LoaderCircle,
  Maximize,
  Minimize,
  Minus,
  Plus,
  RefreshCcw,
  Trash2,
  Upload,
} from "lucide-react";
import styles from "./ImageCanvas.module.css";

export type ImageChangePayload = {
  url: string;
  name: string;
  size: string;
  resolution: string;
  file: File;
};

type ImageCanvasProps = {
  sourceImage: string | null;
  sourceName?: string;
  onImageChange: (payload: ImageChangePayload) => void;
  onImageRemove: () => void;
};

type PanPosition = { x: number; y: number };
type PanGesture = PanPosition & {
  pointerId: number;
  startX: number;
  startY: number;
};

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 40_000_000;

function formatFileSize(bytes: number) {
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(1)} KB`
    : `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export default function ImageCanvas({
  sourceImage,
  sourceName,
  onImageChange,
  onImageRemove,
}: ImageCanvasProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const imageFrameRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const panGestureRef = useRef<PanGesture | null>(null);
  const requestRef = useRef(0);
  const pendingImagesRef = useRef(new Map<string, HTMLImageElement>());
  const dragDepthRef = useRef(0);

  const [dragActive, setDragActive] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [pan, setPan] = useState<PanPosition>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const pendingImages = pendingImagesRef.current;
    const handleFullscreenChange = () => {
      setFullscreen(document.fullscreenElement === canvasRef.current);
      setPan({ x: 0, y: 0 });
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      requestRef.current += 1;
      pendingImages.forEach((image, url) => {
        image.removeAttribute("src");
        URL.revokeObjectURL(url);
      });
      pendingImages.clear();
    };
  }, []);

  function clampPan(position: PanPosition, nextZoom = zoom): PanPosition {
    const frame = imageFrameRef.current;
    const image = imageRef.current;
    const viewport = viewportRef.current;
    if (!frame || !image?.naturalWidth || !viewport || nextZoom <= 100) {
      return { x: 0, y: 0 };
    }

    const fitScale = Math.min(
      frame.clientWidth / image.naturalWidth,
      frame.clientHeight / image.naturalHeight,
    );
    const scale = (fitScale * nextZoom) / 100;
    const maxX = Math.max(0, (image.naturalWidth * scale - viewport.clientWidth) / 2);
    const maxY = Math.max(0, (image.naturalHeight * scale - viewport.clientHeight) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, position.x)),
      y: Math.min(maxY, Math.max(-maxY, position.y)),
    };
  }

  function stopPanning(event?: PointerEvent<HTMLDivElement>) {
    const gesture = panGestureRef.current;
    if (event && gesture?.pointerId !== event.pointerId) return;
    panGestureRef.current = null;
    if (gesture && viewportRef.current?.hasPointerCapture(gesture.pointerId)) {
      viewportRef.current.releasePointerCapture(gesture.pointerId);
    }
    setIsPanning(false);
  }

  function changeZoom(nextZoom: number) {
    stopPanning();
    const value = Math.max(50, Math.min(200, nextZoom));
    setPan(clampPan(pan, value));
    setZoom(value);
  }

  function resetView() {
    stopPanning();
    setPan({ x: 0, y: 0 });
    setZoom(100);
  }

  function startPanning(event: PointerEvent<HTMLDivElement>) {
    if (
      !sourceImage ||
      zoom <= 100 ||
      !event.isPrimary ||
      event.button !== 0 ||
      panGestureRef.current
    ) {
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    panGestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      ...clampPan(pan),
    };
    setIsPanning(true);
  }

  function moveImage(event: PointerEvent<HTMLDivElement>) {
    const gesture = panGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    setPan(
      clampPan({
        x: gesture.x + event.clientX - gesture.startX,
        y: gesture.y + event.clientY - gesture.startY,
      }),
    );
  }

  function cancelPendingImage() {
    requestRef.current += 1;
    pendingImagesRef.current.forEach((image, url) => {
      image.removeAttribute("src");
      URL.revokeObjectURL(url);
    });
    pendingImagesRef.current.clear();
  }

  async function validateAndSetFile(file: File) {
    cancelPendingImage();
    const request = requestRef.current;
    setLoading(false);
    setError("");

    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      setError("Vui lòng chọn ảnh JPG, PNG hoặc WEBP.");
      return;
    }
    if (file.size === 0) {
      setError("Tệp ảnh trống. Vui lòng chọn một ảnh khác.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError("Ảnh vượt quá 20 MB. Vui lòng chọn ảnh có dung lượng nhỏ hơn.");
      return;
    }

    const url = URL.createObjectURL(file);
    const decodedImage = new window.Image();
    pendingImagesRef.current.set(url, decodedImage);
    setLoading(true);

    try {
      decodedImage.src = url;
      await decodedImage.decode();
      if (request !== requestRef.current) return;
      if (!decodedImage.naturalWidth || !decodedImage.naturalHeight) {
        throw new Error("Invalid image dimensions");
      }
      if (decodedImage.naturalWidth * decodedImage.naturalHeight > MAX_IMAGE_PIXELS) {
        setError("Ảnh vượt quá 40 megapixel. Vui lòng giảm độ phân giải rồi thử lại.");
        return;
      }

      onImageChange({
        url,
        name: file.name,
        size: formatFileSize(file.size),
        resolution: `${decodedImage.naturalWidth} × ${decodedImage.naturalHeight}`,
        file,
      });
      // A successfully committed URL belongs to the parent component.
      pendingImagesRef.current.delete(url);
      resetView();
    } catch {
      if (request === requestRef.current) {
        setError("Không thể đọc ảnh này. Tệp có thể bị lỗi; vui lòng chọn ảnh khác.");
      }
    } finally {
      decodedImage.removeAttribute("src");
      if (pendingImagesRef.current.delete(url)) URL.revokeObjectURL(url);
      if (request === requestRef.current) setLoading(false);
    }
  }

  function handleChoose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void validateAndSetFile(file);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    dragDepthRef.current = 0;
    setDragActive(false);
    const file = event.dataTransfer.files[0];
    if (file) void validateAndSetFile(file);
  }

  function removeImage() {
    cancelPendingImage();
    setLoading(false);
    resetView();
    setError("");
    onImageRemove();
  }

  async function toggleFullscreen() {
    setError("");
    try {
      if (document.fullscreenElement === canvasRef.current) {
        await document.exitFullscreen();
      } else if (canvasRef.current?.requestFullscreen) {
        await canvasRef.current.requestFullscreen();
      } else {
        setError("Trình duyệt này chưa hỗ trợ chế độ toàn màn hình.");
      }
    } catch {
      setError("Không thể mở chế độ toàn màn hình. Vui lòng thử lại.");
    }
  }

  return (
    <section ref={canvasRef} className={styles.canvas} aria-label="Ảnh gốc">
      <div className={styles.toolbar}>
        <div className={styles.heading}>
          <ImageIcon size={17} aria-hidden="true" />
          <h2>Ảnh gốc</h2>
          <span className={`${styles.status} ${sourceImage ? styles.ready : ""}`}>
            <span />
            {sourceImage ? "Đã có ảnh" : "Chưa có ảnh"}
          </span>
        </div>

        <div className={styles.controls} aria-label="Công cụ xem ảnh">
          <div className={styles.zoomControls}>
            <button
              type="button"
              className={styles.iconButton}
              onClick={() => changeZoom(zoom - 25)}
              disabled={!sourceImage || zoom <= 50}
              aria-label="Thu nhỏ ảnh"
              title="Thu nhỏ ảnh"
            >
              <Minus size={16} aria-hidden="true" />
            </button>
            <span className={styles.zoomValue} aria-live="polite">
              {zoom}%
            </span>
            <button
              type="button"
              className={styles.iconButton}
              onClick={() => changeZoom(zoom + 25)}
              disabled={!sourceImage || zoom >= 200}
              aria-label="Phóng to ảnh"
              title="Phóng to ảnh"
            >
              <Plus size={16} aria-hidden="true" />
            </button>
          </div>
          <button
            type="button"
            className={styles.fitButton}
            onClick={resetView}
            disabled={!sourceImage}
            aria-label="Đưa ảnh về vừa khung"
            title="Đưa ảnh về vừa khung"
          >
            <Expand size={15} aria-hidden="true" />
            <span className={styles.fitLabel}>Vừa khung</span>
          </button>
          <button
            type="button"
            className={styles.iconButton}
            onClick={() => void toggleFullscreen()}
            aria-label={fullscreen ? "Thoát toàn màn hình ảnh gốc" : "Xem toàn màn hình ảnh gốc"}
            title={fullscreen ? "Thoát toàn màn hình" : "Xem toàn màn hình"}
          >
            {fullscreen ? (
              <Minimize size={16} aria-hidden="true" />
            ) : (
              <Maximize size={16} aria-hidden="true" />
            )}
          </button>
          {sourceImage && (
            <div className={styles.sourceActions}>
              <span className={styles.separator} aria-hidden="true" />
              <button
                type="button"
                className={styles.iconButton}
                onClick={() => inputRef.current?.click()}
                aria-label="Thay ảnh tham chiếu"
                title="Thay ảnh tham chiếu"
              >
                <RefreshCcw size={16} aria-hidden="true" />
              </button>
              <button
                type="button"
                className={styles.deleteButton}
                onClick={removeImage}
                aria-label="Xóa ảnh tham chiếu"
                title="Xóa ảnh tham chiếu"
              >
                <Trash2 size={16} aria-hidden="true" />
                <span className={styles.deleteLabel}>Xóa ảnh</span>
              </button>
            </div>
          )}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleChoose}
        className={styles.fileInput}
        aria-label="Chọn ảnh tham chiếu"
        tabIndex={-1}
      />

      <div
        ref={viewportRef}
        className={`${styles.viewport} ${dragActive ? styles.dragActive : ""} ${sourceImage && zoom > 100 ? styles.zoomed : ""} ${isPanning ? styles.panning : ""}`}
        aria-busy={loading}
        onPointerDown={startPanning}
        onPointerMove={moveImage}
        onPointerUp={stopPanning}
        onPointerCancel={stopPanning}
        onLostPointerCapture={stopPanning}
        onDragEnter={(event) => {
          event.preventDefault();
          if (!event.dataTransfer.types.includes("Files")) return;
          dragDepthRef.current += 1;
          setDragActive(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          event.preventDefault();
          dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
          if (dragDepthRef.current === 0) setDragActive(false);
        }}
        onDrop={handleDrop}
      >
        {sourceImage ? (
          <div ref={imageFrameRef} className={styles.imageFrame}>
            <Image
              ref={imageRef}
              key={sourceImage}
              src={sourceImage}
              alt={sourceName ? `Ảnh tham chiếu: ${sourceName}` : "Ảnh công trình tham chiếu"}
              fill
              unoptimized
              draggable={false}
              sizes="(max-width: 700px) 100vw, (max-width: 1050px) 50vw, 35vw"
              className={styles.sourceImage}
              onLoad={resetView}
              style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom / 100})` }}
            />
          </div>
        ) : (
          <div className={styles.emptyState}>
            <h3>Thêm ảnh gốc</h3>
            <p>Chọn ảnh hiện trạng hoặc phối cảnh để bắt đầu.</p>
            <button
              type="button"
              className={styles.uploadButton}
              onClick={() => inputRef.current?.click()}
            >
              <Upload size={17} aria-hidden="true" />
              Chọn ảnh từ thiết bị
            </button>
            <span className={styles.dropHint}>hoặc kéo và thả ảnh vào đây</span>
            <div
              className={styles.formats}
              aria-label="Định dạng hỗ trợ: JPG, PNG, WEBP. Tối đa 20 MB và 40 megapixel."
            >
              JPG, PNG, WEBP · Tối đa 20 MB · 40 MP
            </div>
          </div>
        )}

        {sourceImage && (
          <div className={styles.imageCaption} title={sourceName}>
            <ImageIcon size={13} aria-hidden="true" />
            <span>{sourceName || "Ảnh tham chiếu"}</span>
          </div>
        )}
        {dragActive && (
          <div className={styles.dropOverlay}>
            <Upload size={28} aria-hidden="true" />
            <span>Thả ảnh để {sourceImage ? "thay thế" : "bắt đầu"}</span>
          </div>
        )}
        {loading && (
          <div className={styles.loadingBadge} role="status">
            <LoaderCircle size={16} aria-hidden="true" />
            Đang đọc ảnh…
          </div>
        )}
      </div>

      {error && (
        <div className={styles.error} role="alert">
          <AlertCircle size={16} aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}
    </section>
  );
}
