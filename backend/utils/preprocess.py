import numpy as np
import cv2
import io

from PIL import Image
import pillow_heif  # 🔑 HEIC SUPPORT

# Register HEIC decoder
pillow_heif.register_heif_opener()


def preprocess_image_from_bytes(image_bytes):
    """
    Decodes image bytes (JPG / PNG / WEBP / HEIC) safely from RAM.
    Returns:
        img_array -> (1, 224, 224, 3) normalized [0,1]
        original_img -> OpenCV BGR image (224x224)
    """

    try:
        # Load image using PIL (HEIC supported)
        pil_img = Image.open(io.BytesIO(image_bytes)).convert("RGB")

        # Resize
        pil_img = pil_img.resize((224, 224))

        # Convert to NumPy
        img_np = np.array(pil_img)

        # Save original for Grad-CAM overlay (BGR)
        original_img = cv2.cvtColor(img_np, cv2.COLOR_RGB2BGR)

        # Normalize for model
        img_array = img_np.astype("float32") / 255.0
        img_array = np.expand_dims(img_array, axis=0)

        return img_array, original_img

    except Exception as e:
        print("Image decoding failed:", e)
        return None, None
