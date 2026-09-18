from abc import ABC, abstractmethod
from typing import Any

from services.image_upload import ImageMetadata

class ImageProvider(ABC):
    @abstractmethod
    def get_status(self) -> dict:
        """Return the configuration status of the provider."""
        pass

    @abstractmethod
    async def check_connection(self) -> dict:
        """Verify the connection to the provider's API."""
        pass

    @abstractmethod
    async def render_image(
        self,
        image_content: bytes,
        metadata: ImageMetadata,
        prompt: str,
        negative_prompt: str,
        size: str = "auto",
    ) -> tuple[bytes, ImageMetadata, str, str]:
        """
        Render an image using the provider.
        Returns image bytes, validated dimensions, provider name and model name.
        """
        pass
