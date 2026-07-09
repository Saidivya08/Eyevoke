from flask import Flask, Response, jsonify, request
from flask_cors import CORS
import cv2
import threading

# ---------------- SENTENCE STORE (SOURCE OF TRUTH) ----------------
sentences_store = [
    "Hi How are You",
    "I need some water",
    "I'm Hungry",
    "I need to use Washroom"
]

# import blink states + runners
from eyevoke_manual_blink import blink_state as manual_state, run_manual_blink
from eyevoke_autoscroll import blink_state as auto_state, run_autoscroll

app = Flask(__name__)
CORS(app)

camera = None
running = False
blink_thread = None
current_mode = None


# ---------------- SENTENCE GETTER ( IMPORTANT) ----------------
def get_sentences():
    return sentences_store


# ---------------- START COMMUNICATION ----------------
@app.route("/start", methods=["GET"])
def start_communication():
    global camera, running, blink_thread, current_mode

    mode = request.args.get("mode", "manual")
    current_mode = mode

    if not running:
        camera = cv2.VideoCapture(0)
        running = True
        print("Camera started")

    #  start blink logic safely
    if blink_thread is None or not blink_thread.is_alive():
        if mode == "auto":
            blink_thread = threading.Thread(
                target=run_autoscroll,
                args=(camera, get_sentences),   #  FIX
                daemon=True
            )
            print("Auto-scroll mode started")
        else:
            blink_thread = threading.Thread(
                target=run_manual_blink,
                args=(camera, get_sentences),   #  FIX
                daemon=True
            )
            print("Manual blink mode started")

        blink_thread.start()

    return jsonify({"status": "started", "mode": mode})


# ---------------- VIDEO FEED ----------------
def generate_frames():
    global camera, running

    while running and camera and camera.isOpened():
        success, frame = camera.read()
        if not success:
            break

        ret, buffer = cv2.imencode(".jpg", frame)
        frame = buffer.tobytes()

        yield (
            b"--frame\r\n"
            b"Content-Type: image/jpeg\r\n\r\n" + frame + b"\r\n"
        )

@app.route("/video_feed")
def video_feed():
    return Response(
        generate_frames(),
        mimetype="multipart/x-mixed-replace; boundary=frame"
    )


# ---------------- BLINK STATUS ----------------
@app.route("/blink_status")
def blink_status():
    if current_mode == "auto":
        data = auto_state.copy()
        auto_state["action"] = None   #  reset AFTER frontend read
    else:
        data = manual_state.copy()
        manual_state["action"] = None #  reset AFTER frontend read

    return jsonify(data)


# ---------------- UPDATE SENTENCES ----------------
@app.route("/update_sentences", methods=["POST"])
def update_sentences():
    global sentences_store
    data = request.json or {}
    new_sentences = data.get("sentences", [])

    if not new_sentences:
        print("⚠️ Empty sentence update ignored")
        return jsonify({"status": "ignored"})

    sentences_store = new_sentences
    print("Sentences updated:", sentences_store)
    return jsonify({"status": "updated"})


# ---------------- GET SENTENCES ----------------
@app.route("/get_sentences", methods=["GET"])
def get_sentences_api():
    return jsonify({"sentences": sentences_store})


# ---------------- STOP COMMUNICATION ----------------
@app.route("/stop", methods=["GET"])
def stop_communication():
    global camera, running, current_mode

    running = False
    current_mode = None

    if camera:
        camera.release()
        camera = None
        print("Camera stopped")

    return jsonify({"status": "stopped"})


# ---------------- RUN SERVER ----------------
if __name__ == "__main__":
    app.run(port=5000, debug=True)
