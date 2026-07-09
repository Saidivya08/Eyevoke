import cv2
import mediapipe as mp
import pyttsx3
import numpy as np
import threading
import time
import signal

# ---------------- SHARED STATE ----------------
blink_state = {"index": 0, "action": None}
running = True

def handle_exit(sig, frame):
    global running
    running = False

signal.signal(signal.SIGTERM, handle_exit)
signal.signal(signal.SIGINT, handle_exit)

# ---------------- BLINK SETTINGS ----------------
EAR_THRESHOLD = 0.25
SHORT_BLINK_FRAMES = 5
LONG_BLINK_FRAMES = 15
SPEAK_COOLDOWN = 2.5

# ---------------- MEDIAPIPE ----------------
mp_face_mesh = mp.solutions.face_mesh
face_mesh = mp_face_mesh.FaceMesh(max_num_faces=1, refine_landmarks=True)

LEFT_EYE = [33, 160, 158, 133, 153, 144]
RIGHT_EYE = [362, 385, 387, 263, 373, 380]

blink_counter = 0
blink_active = False
speaking = False
last_speak_time = 0.0

# ---------------- HELPERS ----------------
def emit_action(action, index):
    blink_state["action"] = None
    time.sleep(0.03)
    blink_state["index"] = index
    blink_state["action"] = action

def speak_sentence(sentence):
    global speaking, last_speak_time
    speaking = True
    engine = pyttsx3.init()
    engine.setProperty("rate", 125)
    engine.say(sentence)
    engine.runAndWait()
    speaking = False
    last_speak_time = time.time()

def calculate_ear(landmarks, eye, w, h):
    pts = [(int(landmarks[i].x * w), int(landmarks[i].y * h)) for i in eye]
    A = np.linalg.norm(np.array(pts[1]) - np.array(pts[5]))
    B = np.linalg.norm(np.array(pts[2]) - np.array(pts[4]))
    C = np.linalg.norm(np.array(pts[0]) - np.array(pts[3]))
    return 0 if C == 0 else (A + B) / (2 * C)

# ---------------- MAIN LOOP ----------------
def run_manual_blink(cap, get_sentences):
    global blink_counter, blink_active
    current_index = 0

    blink_state["index"] = 0
    blink_state["action"] = None

    while running and cap and cap.isOpened():
        sentences = get_sentences()
        if not sentences:
            time.sleep(0.1)
            continue

        ret, frame = cap.read()
        if not ret:
            break

        h, w, _ = frame.shape
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = face_mesh.process(cv2.flip(rgb, 1))

        if results.multi_face_landmarks:
            lm = results.multi_face_landmarks[0]
            ear = (
                calculate_ear(lm.landmark, LEFT_EYE, w, h) +
                calculate_ear(lm.landmark, RIGHT_EYE, w, h)
            ) / 2

            if ear < EAR_THRESHOLD:
                blink_counter += 1
                blink_active = True
            else:
                if blink_active:
                    if SHORT_BLINK_FRAMES <= blink_counter < LONG_BLINK_FRAMES:
                        current_index = (current_index + 1) % len(sentences)
                        emit_action("move", current_index)

                    elif blink_counter >= LONG_BLINK_FRAMES:
                        now = time.time()
                        if not speaking and now - last_speak_time > SPEAK_COOLDOWN:
                            emit_action("select", current_index)
                            threading.Thread(
                                target=speak_sentence,
                                args=(sentences[current_index],),
                                daemon=True
                            ).start()

                blink_counter = 0
                blink_active = False

    face_mesh.close()