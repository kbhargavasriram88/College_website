import cv2
import os

# Ask for person name (this will be folder name)
name = input("Enter person name (e.g., vedha): ").strip()

# Dataset path
dataset_dir = "dataset"
person_dir = os.path.join(dataset_dir, name)

# Create folders if not exist
if not os.path.exists(dataset_dir):
    os.mkdir(dataset_dir)

if not os.path.exists(person_dir):
    os.mkdir(person_dir)

print("[INFO] Dataset directory ready:", person_dir)

# Open camera
cam = cv2.VideoCapture(0)

count = 0
max_images = 20   # capture 20 images

print("[INFO] Camera started")
print("[INFO] Press 's' to save image")
print("[INFO] Press 'q' to quit")

while True:
    ret, frame = cam.read()
    if not ret:
        print("[ERROR] Camera not working")
        break

    # Show camera frame
    cv2.imshow("Create Dataset", frame)

    key = cv2.waitKey(1) & 0xFF

    # Save image
    if key == ord('s'):
        count += 1
        img_name = f"img_{count}.jpg"
        img_path = os.path.join(person_dir, img_name)
        cv2.imwrite(img_path, frame)
        print(f"[SAVED] {img_path}")

    # Stop conditions
    if key == ord('q') or count >= max_images:
        break

# Release resources
cam.release()
cv2.destroyAllWindows()

print(f"[DONE] Dataset created with {count} images for '{name}'")