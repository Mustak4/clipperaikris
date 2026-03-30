import argparse
import json


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--video", required=True)
    parser.add_argument("--fps", type=float, default=2.0)
    args = parser.parse_args()

    try:
        import cv2  # type: ignore
    except Exception:
        print(json.dumps({"keyframes": []}))
        return

    cap = cv2.VideoCapture(args.video)
    if not cap.isOpened():
        print(json.dumps({"keyframes": []}))
        return

    src_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    sample_every = max(1, int(round(src_fps / max(0.1, args.fps))))
    cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    face_cascade = cv2.CascadeClassifier(cascade_path)

    keyframes = []
    frame_idx = 0

    while True:
        ok, frame = cap.read()
        if not ok:
            break

        if frame_idx % sample_every != 0:
            frame_idx += 1
            continue

        h, w = frame.shape[:2]
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        faces = face_cascade.detectMultiScale(
            gray,
            scaleFactor=1.1,
            minNeighbors=5,
            minSize=(max(36, int(w * 0.04)), max(36, int(h * 0.04))),
        )

        if len(faces) > 0:
            x, y, fw, fh = max(faces, key=lambda f: f[2] * f[3])
            center_x = float(x + fw / 2.0)
            face_width_ratio = float(fw / max(1, w))
            t = float(frame_idx / max(0.1, src_fps))
            keyframes.append(
                {
                    "t": round(t, 3),
                    "centerX": round(center_x, 2),
                    "faceWidthRatio": round(face_width_ratio, 4),
                }
            )

        frame_idx += 1

    cap.release()
    print(json.dumps({"keyframes": keyframes}))


if __name__ == "__main__":
    main()

