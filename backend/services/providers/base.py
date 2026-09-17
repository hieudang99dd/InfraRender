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
    ) -> tuple[bytes, Any]:
        """
        Render an image using the provider.
        Returns a tuple of (result_image_bytes, result_metadata_object).
        The result_metadata_object should have attributes: width, height, provider, model.
        """
        pass
