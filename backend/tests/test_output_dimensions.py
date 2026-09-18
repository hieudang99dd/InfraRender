"""Verify real output sizes and truthful native/upscale metadata without API calls."""

import importlib
import unittest
from io import BytesIO

from fastapi import HTTPException
from PIL import Image

from services.image_upload import ImageMetadata


def metadata(width=1920, height=1080):
    return ImageMetadata(width, height, "image/png", ".png")


class OutputDimensionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.module = importlib.import_module("services.output_dimensions")

    def test_4k_landscape_is_requested_natively(self):
        plan = self.module.plan_output(metadata(), "4K", "16:9")
        self.assertEqual((plan.width, plan.height), (3840, 2160))
        self.assertEqual(plan.provider_size, "3840x2160")
        self.assertTrue(plan.experimental)

    def test_quality_sets_actual_long_edge_and_preserves_requested_ratio(self):
        for quality, expected in (("1K", (1024, 576)), ("2K", (2560, 1440)), ("8K", (7680, 4320))):
            with self.subTest(quality=quality):
                plan = self.module.plan_output(metadata(), quality, "16:9")
                self.assertEqual((plan.width, plan.height), expected)
        portrait = self.module.plan_output(metadata(), "4K", "9:16")
        self.assertEqual((portrait.width, portrait.height), (2160, 3840))
        self.assertEqual(portrait.provider_size, "2160x3840")

    def test_original_uses_source_pixels_and_ratio(self):
        plan = self.module.plan_output(metadata(1234, 987), None, None)
        self.assertEqual((plan.width, plan.height), (1234, 987))
        plan = self.module.plan_output(metadata(1200, 900), "Original", "1:1")
        self.assertEqual((plan.width, plan.height), (1200, 1200))

    def test_flexible_provider_dimensions_always_obey_supported_limits(self):
        for quality in ("Original", "1K", "2K", "4K", "8K"):
            for ratio in ("1:1", "16:9", "9:16", "3:1", "1:3", "4:3"):
                if quality == "8K" and ratio in ("1:1", "4:3"):
                    continue
                with self.subTest(quality=quality, ratio=ratio):
                    plan = self.module.plan_output(metadata(8, 6), quality, ratio)
                    width, height = map(int, plan.provider_size.split("x"))
                    self.assertEqual(width % 16, 0)
                    self.assertEqual(height % 16, 0)
                    self.assertLessEqual(max(width, height), 3840)
                    self.assertGreaterEqual(width * height, 655360)
                    self.assertLessEqual(width * height, 8294400)
                    self.assertLessEqual(max(width, height) / min(width, height), 3)

    def test_legacy_models_use_supported_size_presets(self):
        for ratio, expected in (("16:9", "1536x1024"), ("9:16", "1024x1536"), ("1:1", "1024x1024")):
            with self.subTest(ratio=ratio):
                plan = self.module.plan_output(metadata(), "4K", ratio, "gpt-image-1")
                self.assertEqual(plan.provider_size, expected)
                self.assertFalse(plan.experimental)

    def test_invalid_ratio_quality_or_pixel_budget_fails_before_rendering(self):
        for quality, ratio in (("8K", "1:1"), ("4K", "5:1"), ("4K", "1:4"), ("4K", "0:1"), ("4K", "1.5:1"), ("bogus", "1:1")):
            with self.subTest(quality=quality, ratio=ratio), self.assertRaises(HTTPException) as raised:
                self.module.plan_output(metadata(), quality, ratio)
            self.assertEqual(raised.exception.status_code, 422)
        with self.assertRaises(HTTPException):
            self.module.plan_output(metadata(0, 100))

    def test_native_output_is_preserved_byte_for_byte(self):
        buf = BytesIO()
        Image.new("RGB", (64, 48), "green").save(buf, "PNG")
        content = buf.getvalue()
        native = metadata(64, 48)
        plan = self.module.plan_output(native)
        result, result_metadata, details = self.module.process_output(content, native, plan)
        self.assertEqual(result, content)
        self.assertEqual(result_metadata, native)
        self.assertEqual(details["native_size"], "64x48")
        self.assertEqual(details["final_size"], "64x48")
        self.assertEqual(details["processing"], "native")
        self.assertFalse(details["upscaled"])
        self.assertFalse(details["cropped"])

    def test_postprocess_crops_center_without_stretching_and_reports_upscale(self):
        source = Image.new("RGB", (12, 8), "red")
        source.paste("blue", (2, 0, 10, 8))
        buf = BytesIO()
        source.save(buf, "PNG")
        plan = self.module.plan_output(metadata(16, 16))
        result, result_metadata, details = self.module.process_output(buf.getvalue(), metadata(12, 8), plan)
        with Image.open(BytesIO(result)) as output:
            self.assertEqual(output.size, (16, 16))
            self.assertEqual(output.getpixel((8, 8)), (0, 0, 255))
        self.assertEqual((result_metadata.width, result_metadata.height), (16, 16))
        self.assertEqual(details["native_size"], "12x8")
        self.assertTrue(details["upscaled"])
        self.assertTrue(details["cropped"])
        self.assertEqual(details["processing"], "cropped_and_resized")

    def test_resize_and_crop_only_are_distinguished_from_upscale(self):
        buf = BytesIO()
        Image.new("RGB", (12, 8), "blue").save(buf, "PNG")
        for target, processing, cropped in (((6, 4), "resized", False), ((8, 8), "cropped", True)):
            with self.subTest(target=target):
                result, _, details = self.module.process_output(buf.getvalue(), metadata(12, 8), self.module.plan_output(metadata(*target)))
                with Image.open(BytesIO(result)) as output:
                    self.assertEqual(output.size, target)
                self.assertEqual(details["processing"], processing)
                self.assertEqual(details["cropped"], cropped)
                self.assertFalse(details["upscaled"])


if __name__ == "__main__":
    unittest.main()
