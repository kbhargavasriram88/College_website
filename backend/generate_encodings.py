from __future__ import annotations

import pickle
from pathlib import Path

try:
    import face_recognition  # type: ignore
except Exception as exc:  # pragma: no cover - optional dependency
    raise SystemExit(
        "face_recognition is not installed. Run ./setup_backend.ps1 -InstallFaceRecognition first."
    ) from exc


BASE_DIR = Path(__file__).resolve().parent
DATASET_DIR = BASE_DIR / "dataset"
ENCODINGS_PATH = BASE_DIR / "encodings.pkl"
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


def image_files(person_dir: Path) -> list[Path]:
    return sorted(
        file_path
        for file_path in person_dir.iterdir()
        if file_path.is_file() and file_path.suffix.lower() in IMAGE_SUFFIXES
    )


def main() -> None:
    if not DATASET_DIR.exists():
        raise SystemExit(
            f"Dataset folder not found at {DATASET_DIR}. Create backend/dataset/<student_name_or_roll>/image.jpg first."
        )

    known_encodings = []
    known_names = []
    trained_images = 0

    for person_dir in sorted(path for path in DATASET_DIR.iterdir() if path.is_dir()):
        person_name = person_dir.name.strip()
        if not person_name:
            continue

        for image_path in image_files(person_dir):
            image = face_recognition.load_image_file(str(image_path))
            encodings = face_recognition.face_encodings(image)
            if not encodings:
                print(f"Skipping {image_path.name}: no face found.")
                continue

            known_encodings.append(encodings[0])
            known_names.append(person_name)
            trained_images += 1

    with ENCODINGS_PATH.open("wb") as handle:
        pickle.dump({"encodings": known_encodings, "names": known_names}, handle)

    print(f"Saved {trained_images} trained face image(s) to {ENCODINGS_PATH}.")
    if trained_images == 0:
        print("No valid faces were found yet. Add clear student photos and run this script again.")


if __name__ == "__main__":
    main()
