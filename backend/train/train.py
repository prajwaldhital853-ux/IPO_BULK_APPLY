"""Train the CDSC captcha model and export to ONNX.

Input: data/labeled/<label>_<uuid>.png where <label> is the N-digit answer.
Output: models/captcha.onnx (+ a Keras .h5 for reference).

Architecture: shared CNN base -> N independent softmax heads (10 classes each).
Preprocessing MUST match app/captcha_model.py (grayscale, 160x60, /255).

Usage:
    python -m backend.train.train --data data/labeled --out models/captcha.onnx
"""
from __future__ import annotations

import argparse
import pathlib

import numpy as np
from PIL import Image

from app.config import get_settings

IMG_W = 160
IMG_H = 60


def load_dataset(data_dir: str, digits: int) -> tuple[np.ndarray, list[np.ndarray]]:
    paths = sorted(pathlib.Path(data_dir).glob("*.png"))
    xs: list[np.ndarray] = []
    ys: list[list[int]] = []
    for p in paths:
        label = p.stem.split("_", 1)[0]
        if len(label) != digits or not label.isdigit():
            continue
        img = Image.open(p).convert("L").resize((IMG_W, IMG_H))
        xs.append(np.asarray(img, dtype=np.float32) / 255.0)
        ys.append([int(c) for c in label])
    if not xs:
        raise SystemExit(f"No labeled images in {data_dir}")
    x = np.stack(xs).reshape(-1, IMG_H, IMG_W, 1)
    y_cols = np.array(ys)  # (n, digits)
    y_heads = [y_cols[:, i] for i in range(digits)]
    print(f"loaded {len(xs)} samples")
    return x, y_heads


def build_model(digits: int):
    from tensorflow import keras
    from tensorflow.keras import layers

    inp = keras.Input(shape=(IMG_H, IMG_W, 1), name="image")
    x = layers.Conv2D(32, 3, activation="relu", padding="same")(inp)
    x = layers.MaxPooling2D()(x)
    x = layers.Conv2D(64, 3, activation="relu", padding="same")(x)
    x = layers.MaxPooling2D()(x)
    x = layers.Conv2D(128, 3, activation="relu", padding="same")(x)
    x = layers.MaxPooling2D()(x)
    x = layers.Flatten()(x)
    x = layers.Dense(256, activation="relu")(x)
    x = layers.Dropout(0.3)(x)
    outputs = [
        layers.Dense(10, activation="softmax", name=f"d{i}")(x) for i in range(digits)
    ]
    model = keras.Model(inp, outputs)
    model.compile(
        optimizer="adam",
        loss=["sparse_categorical_crossentropy"] * digits,
        metrics=[["accuracy"]] * digits,
    )
    return model


def evaluate(model, x: np.ndarray, y_heads: list[np.ndarray], digits: int, label: str) -> dict:
    preds = model.predict(x, verbose=0)
    pred_digits = np.stack([np.argmax(p, axis=1) for p in preds], axis=1)
    true_digits = np.stack(y_heads, axis=1)
    per_pos = [
        float(np.mean(pred_digits[:, i] == true_digits[:, i])) for i in range(digits)
    ]
    per_digit = float(np.mean(pred_digits == true_digits))
    whole = float(np.mean(np.all(pred_digits == true_digits, axis=1)))
    return {
        "split": label,
        "samples": int(len(x)),
        "per_digit_accuracy": per_digit,
        "whole_captcha_accuracy": whole,
        "per_position_accuracy": per_pos,
    }


def print_report(reports: list[dict], digits: int, total: int, train_n: int, val_n: int) -> None:
    print("\n" + "=" * 60)
    print("CAPTCHA MODEL TRAINING REPORT")
    print("=" * 60)
    print(f"Dataset total     : {total}")
    print(f"Train / Val split : {train_n} / {val_n}  (90% / 10%)")
    print(f"Digit length      : {digits}")
    for r in reports:
        print(f"\n--- {r['split']} set ({r['samples']} samples) ---")
        print(f"  Per-digit accuracy   : {r['per_digit_accuracy'] * 100:.2f}%")
        print(f"  Whole-captcha accuracy: {r['whole_captcha_accuracy'] * 100:.2f}%")
        for i, acc in enumerate(r["per_position_accuracy"]):
            print(f"  Position {i + 1} accuracy    : {acc * 100:.2f}%")
    print("=" * 60 + "\n")


def main(data: str, out: str, epochs: int) -> None:
    import tensorflow as tf
    import tf2onnx

    digits = get_settings().cdsc_captcha_digits
    x, y_heads = load_dataset(data, digits)

    n = len(x)
    split = int(n * 0.9)
    idx = np.arange(n)
    rng = np.random.default_rng(42)
    rng.shuffle(idx)
    x = x[idx]
    y_heads = [y[idx] for y in y_heads]
    x_train, x_val = x[:split], x[split:]

    y_train = [y[:split] for y in y_heads]
    y_val = [y[split:] for y in y_heads]

    model = build_model(digits)
    model.fit(
        x_train,
        y_train,
        validation_data=(x_val, y_val),
        epochs=epochs,
        batch_size=64,
    )

    train_report = evaluate(model, x_train, y_train, digits, "Train")
    val_report = evaluate(model, x_val, y_val, digits, "Validation")
    print_report([train_report, val_report], digits, n, split, n - split)

    report_path = pathlib.Path(out).with_suffix(".report.txt")
    lines = [
        "CAPTCHA MODEL TRAINING REPORT",
        f"Dataset total: {n}",
        f"Train/Val: {split}/{n - split}",
        f"Epochs: {epochs}",
        "",
    ]
    for r in (train_report, val_report):
        lines.append(f"[{r['split']}] samples={r['samples']}")
        lines.append(f"  per-digit acc: {r['per_digit_accuracy']:.4f}")
        lines.append(f"  whole-captcha acc: {r['whole_captcha_accuracy']:.4f}")
        for i, acc in enumerate(r["per_position_accuracy"]):
            lines.append(f"  position {i + 1} acc: {acc:.4f}")
        lines.append("")
    report_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"saved report -> {report_path}")

    out_path = pathlib.Path(out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    h5 = out_path.with_suffix(".h5")
    model.save(h5)
    print(f"saved keras model -> {h5}")

    spec = (tf.TensorSpec((None, IMG_H, IMG_W, 1), tf.float32, name="image"),)
    tf2onnx.convert.from_keras(
        model, input_signature=spec, output_path=str(out_path)
    )
    print(f"exported ONNX -> {out_path}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="data/labeled")
    ap.add_argument("--out", default="models/captcha.onnx")
    ap.add_argument("--epochs", type=int, default=30)
    args = ap.parse_args()
    main(args.data, args.out, args.epochs)
