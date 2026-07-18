"""ONNX inference for the CDSC numeric captcha.

Model: shared CNN base with N softmax heads (N = CDSC_CAPTCHA_DIGITS), each over
10 digit classes. Trained by backend/train/train.py and exported to ONNX.

Preprocessing here MUST match train/train.py exactly.
"""
from __future__ import annotations

import base64
import io
import os
from dataclasses import dataclass, field

import numpy as np
from PIL import Image, ImageEnhance, ImageOps

from .config import get_settings

IMG_W = 160
IMG_H = 60


@dataclass
class Prediction:
    text: str
    confidence: float  # min per-digit probability (worst char)
    digit_confs: tuple[float, ...] = field(default_factory=tuple)
    method: str = "single"


def _array_from_pil(img: Image.Image) -> np.ndarray:
    resized = img.convert("L").resize((IMG_W, IMG_H))
    arr = np.asarray(resized, dtype=np.float32) / 255.0
    return arr.reshape(1, IMG_H, IMG_W, 1)


def preprocess(image_bytes: bytes) -> np.ndarray:
    """Bytes -> (1, IMG_H, IMG_W, 1) float32 in [0, 1], grayscale."""
    img = Image.open(io.BytesIO(image_bytes)).convert("L")
    return _array_from_pil(img)


def preprocess_variants(image_bytes: bytes) -> list[np.ndarray]:
    """Several grayscale views of the same captcha for test-time averaging."""
    base = Image.open(io.BytesIO(image_bytes)).convert("L")
    views: list[Image.Image] = [
        base,
        ImageOps.autocontrast(base),
        ImageEnhance.Contrast(base).enhance(1.35),
        ImageEnhance.Contrast(base).enhance(0.72),
        ImageEnhance.Brightness(base).enhance(1.12),
        ImageEnhance.Brightness(base).enhance(0.88),
        ImageEnhance.Sharpness(base).enhance(1.45),
    ]
    return [_array_from_pil(img) for img in views]


def preprocess_base64(image_b64: str) -> np.ndarray:
    clean = image_b64.split(",", 1)[-1] if image_b64.startswith("data:") else image_b64
    return preprocess(base64.b64decode(clean))


class CaptchaModel:
    def __init__(self, model_path: str | None = None) -> None:
        settings = get_settings()
        self._path = model_path or settings.captcha_model_path
        self._digits = settings.cdsc_captcha_digits
        self._session = None

    @property
    def available(self) -> bool:
        return os.path.exists(self._path)

    def _ensure(self) -> None:
        if self._session is not None:
            return
        if not self.available:
            raise FileNotFoundError(
                f"Captcha model not found at {self._path}. Train it first "
                "(backend/train/train.py) or rely on the 2Captcha fallback."
            )
        import onnxruntime as ort

        self._session = ort.InferenceSession(
            self._path, providers=["CPUExecutionProvider"]
        )

    def _predict_arrays(self, arrays: list[np.ndarray]) -> Prediction:
        self._ensure()
        assert self._session is not None
        input_name = self._session.get_inputs()[0].name
        acc: list[np.ndarray] | None = None
        for x in arrays:
            outputs = self._session.run(None, {input_name: x})
            if acc is None:
                acc = [head[0].copy() for head in outputs]
            else:
                for i, head in enumerate(outputs):
                    acc[i] += head[0]
        assert acc is not None
        n = float(len(arrays))
        chars: list[str] = []
        confs: list[float] = []
        for probs in acc:
            avg = probs / n
            idx = int(np.argmax(avg))
            chars.append(str(idx))
            confs.append(float(avg[idx]))
        return Prediction(
            text="".join(chars),
            confidence=min(confs) if confs else 0.0,
            digit_confs=tuple(confs),
        )

    def predict(self, image_b64: str) -> Prediction:
        clean = (
            image_b64.split(",", 1)[-1]
            if image_b64.startswith("data:")
            else image_b64
        )
        x = preprocess(base64.b64decode(clean))
        pred = self._predict_arrays([x])
        pred.method = "single"
        return pred

    def predict_robust(self, image_b64: str) -> Prediction:
        """Average softmax outputs across several preprocess variants."""
        clean = (
            image_b64.split(",", 1)[-1]
            if image_b64.startswith("data:")
            else image_b64
        )
        variants = preprocess_variants(base64.b64decode(clean))
        pred = self._predict_arrays(variants)
        pred.method = "ensemble"
        return pred
