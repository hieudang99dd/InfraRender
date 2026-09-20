import type { RenderSettings } from "./render-settings";

export type QuickSetting = {
  id: string;
  label: string;
  description: string;
  apply: (settings: RenderSettings) => RenderSettings;
  matches: (settings: RenderSettings) => boolean;
  getPreview: (settings: RenderSettings) => string[];
};

export const QUICK_SETTINGS: QuickSetting[] = [
  {
    id: "bao_toan",
    label: "Bảo toàn",
    description: "Giữ thiết kế gần nhất với ảnh hiện trạng.",
    apply: (settings) => ({
      ...settings,
      preserve_geometry: true,
      preserve_road_markings: true,
      camera: "preserve the original camera perspective",
      creativity: 5,
    }),
    matches: (settings) =>
      settings.preserve_geometry === true &&
      settings.preserve_road_markings === true &&
      settings.camera === "preserve the original camera perspective" &&
      settings.creativity === 5,
    getPreview: () => [
      "✓ Giữ hình khối",
      "✓ Giữ vạch đường",
      "✓ Giữ góc nhìn gốc",
      "• Sáng tạo: 5%",
    ],
  },
  {
    id: "can_bang",
    label: "Cân bằng",
    description: "Cho phép cải thiện vừa phải nhưng vẫn giữ cấu trúc chính.",
    apply: (settings) => ({
      ...settings,
      preserve_geometry: true,
      preserve_road_markings: true,
      creativity: 30,
      style: settings.style || "photorealistic visualization",
    }),
    matches: (settings) =>
      settings.preserve_geometry === true &&
      settings.preserve_road_markings === true &&
      settings.creativity === 30,
    getPreview: () => [
      "✓ Giữ hình khối",
      "✓ Giữ vạch đường",
      "• Sáng tạo: 30%",
      "• Giữ thời tiết hiện tại",
      "• Giữ góc nhìn hiện tại",
    ],
  },
  {
    id: "canh_quan",
    label: "Cảnh quan",
    description: "Tăng cường cây xanh và cảnh quan đô thị.",
    apply: (settings) => ({
      ...settings,
      vegetation: "urban landscape planting",
      vegetation_density: "moderate",
    }),
    matches: (settings) =>
      settings.vegetation === "urban landscape planting" &&
      settings.vegetation_density === "moderate",
    getPreview: () => [
      "• Cây xanh đô thị",
      "• Mật độ: Trung bình",
      "• Giữ thời tiết hiện tại",
      "• Giữ ánh sáng hiện tại",
    ],
  },
  {
    id: "ha_tang",
    label: "Hạ tầng",
    description: "Ưu tiên đường sá và hạ tầng rõ ràng, chuyên nghiệp.",
    apply: (settings) => ({
      ...settings,
      preserve_road_markings: true,
      creativity: 20,
      style: "clean professional architectural presentation",
      roads: settings.roads || "asphalt road surface",
    }),
    matches: (settings) =>
      settings.preserve_road_markings === true &&
      settings.creativity === 20 &&
      settings.style === "clean professional architectural presentation",
    getPreview: (settings) => {
      const items = ["✓ Giữ vạch đường", "• Sáng tạo: 20%", "• Phong cách: Trình bày kỹ thuật"];
      if (settings.roads) {
        items.push("• Giữ mặt đường hiện tại");
      } else {
        items.push("• Mặt đường: Asphalt nếu chưa chọn");
      }
      return items;
    },
  },
  {
    id: "chan_thuc",
    label: "Chân thực",
    description: "Ưu tiên kết quả tự nhiên và gần ảnh chụp.",
    apply: (settings) => ({
      ...settings,
      style: "photorealistic visualization",
      lighting: settings.lighting || "natural daylight",
      camera: settings.camera || "preserve the original camera perspective",
      creativity: settings.creativity === null ? 20 : settings.creativity,
    }),
    matches: (settings) => settings.style === "photorealistic visualization",
    getPreview: (settings) => {
      const items = ["• Phong cách: Chân thực"];

      if (settings.lighting) {
        items.push("• Giữ ánh sáng hiện tại");
      } else {
        items.push("• Ánh sáng: Tự nhiên");
      }

      if (settings.camera) {
        items.push("• Giữ góc nhìn hiện tại");
      } else {
        items.push("• Giữ góc nhìn gốc");
      }

      if (settings.creativity !== null) {
        items.push(`• Giữ sáng tạo hiện tại: ${settings.creativity}%`);
      } else {
        items.push("• Sáng tạo: 20%");
      }

      return items;
    },
  },
];
