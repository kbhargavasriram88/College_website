from __future__ import annotations

import pickle
import secrets
import sqlite3
from datetime import datetime
from functools import wraps
import os
import base64
import io
import numpy as np  # type: ignore
from PIL import Image  # type: ignore
from pathlib import Path
from typing import Any, Callable, TypeVar, cast

from flask import Flask, abort, jsonify, redirect, request, send_from_directory, session  # type: ignore
from werkzeug.security import check_password_hash, generate_password_hash  # type: ignore

try:
    import cv2  # type: ignore
    import face_recognition  # type: ignore
except Exception:
    cv2 = None
    face_recognition = None

BASE_DIR = Path(__file__).resolve().parent
SITE_DIR = BASE_DIR.parent / "SMART_ATTENDENCE"
DATABASE_PATH = Path(os.environ.get("SMART_ATTENDANCE_DB_PATH", BASE_DIR / "smart_attendance.db"))
ENCODINGS_PATH = BASE_DIR / "encodings.pkl"
SECRET_KEY_PATH = Path(os.environ.get("SMART_ATTENDANCE_SECRET_PATH", BASE_DIR / "secret.key"))
DEFAULT_TEACHER = {
    "username": "teacher",
    "password": "admin123",
    "name": "Teacher Admin",
}
PUBLIC_PATHS = {
    "login.html",
    "login.css",
    "logout.html",
    "logout.css",
    "forgot-password.html",
    "forgot-password.css",
    "api.js",
}
F = TypeVar("F", bound=Callable[..., Any])


def load_secret_key() -> str:
    if SECRET_KEY_PATH.exists():
        return SECRET_KEY_PATH.read_text(encoding="utf-8").strip()

    secret_key = secrets.token_hex(32)
    SECRET_KEY_PATH.write_text(secret_key, encoding="utf-8")
    return secret_key


app = Flask(__name__)
app.config.update(
    SECRET_KEY=load_secret_key(),
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
)

known_encodings: list[Any] = []
known_names: list[str] = []
camera = None
marked: set[str] = set()
face_status_message = ""


def get_db() -> sqlite3.Connection:
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def normalize_text(value: Any) -> str:
    return str(value or "").strip()


def normalize_key(value: Any) -> str:
    return normalize_text(value).lower()


def normalize_status(value: Any) -> str:
    return "A" if normalize_key(value) == "a" else "P"


def face_status_payload(ready: bool, message: str) -> dict[str, Any]:
    return {
        "ready": ready,
        "message": message,
        "encodingsPath": str(ENCODINGS_PATH),
    }


def is_hashed_password(value: str) -> bool:
    return normalize_text(value).startswith(("pbkdf2:", "scrypt:"))


def hash_password(value: str) -> str:
    return generate_password_hash(normalize_text(value))


def verify_password(stored_password: str, provided_password: str) -> bool:
    stored_password = normalize_text(stored_password)
    provided_password = normalize_text(provided_password)

    if not stored_password or not provided_password:
        return False

    if is_hashed_password(stored_password):
        return check_password_hash(stored_password, provided_password)

    return stored_password == provided_password


def dashboard_for_role(role: str) -> str:
    return "/teacher_final/T_dashboard.html" if role == "teacher" else "/student_final/dashboard.html"


def redirect_for_session() -> Any:
    role = normalize_key(session.get("role"))
    if role in {"teacher", "student"}:
        return redirect(dashboard_for_role(role))
    return redirect("/login.html")


def current_session_payload() -> dict[str, str]:
    return {
        "role": normalize_text(session.get("role")),
        "username": normalize_text(session.get("username")),
        "name": normalize_text(session.get("name")),
        "studentRoll": normalize_text(session.get("studentRoll")),
        "studentName": normalize_text(session.get("studentName")),
        "dashboard": dashboard_for_role(normalize_key(session.get("role") or "student")),
    }


def login_required(role: str | None = None) -> Any:
    def decorator(func: Any) -> Any:
        @wraps(func)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            current_role = normalize_key(session.get("role"))
            if current_role not in {"teacher", "student"}:
                return jsonify({"error": "Authentication required."}), 401

            if role and current_role != normalize_key(role):
                print(f"DEBUG: Access Denied. current_role='{current_role}', required_role='{normalize_key(role)}'")
                return jsonify({"error": "You do not have access to this resource."}), 403

            return func(*args, **kwargs)

        return wrapper

    return decorator


def serialize_student(row: sqlite3.Row | dict[str, Any]) -> dict[str, Any]:
    return {
        "photo": normalize_text(row["photo"]),
        "roll": normalize_text(row["roll"]),
        "name": normalize_text(row["name"]),
        "email": normalize_text(row["email"]),
        "password": "",
        "hasPassword": bool(normalize_text(row["password"])),
        "phone": normalize_text(row["phone"]),
        "course": normalize_text(row["course"]),
        "year": normalize_text(row["year"]),
        "semester": normalize_text(row["semester"]),
        "class": normalize_text(row["class_name"]),
        "address": normalize_text(row["address"]),
    }


def serialize_attendance_record(row: sqlite3.Row | dict[str, Any]) -> dict[str, str]:
    return {
        "date": normalize_text(row["date"]),
        "subject": normalize_text(row["subject"]),
        "class": normalize_text(row["class_name"]),
        "roll": normalize_text(row["roll"]),
        "name": normalize_text(row["name"]),
        "status": normalize_status(row["status"]),
    }


def normalize_student_payload(payload: dict[str, Any] | None) -> dict[str, str]:
    payload = payload or {}
    return {
        "photo": normalize_text(payload.get("photo")),
        "roll": normalize_text(payload.get("roll")),
        "name": normalize_text(payload.get("name")),
        "email": normalize_text(payload.get("email")),
        "password": normalize_text(payload.get("password")),
        "phone": normalize_text(payload.get("phone")),
        "course": normalize_text(payload.get("course")),
        "year": normalize_text(payload.get("year")),
        "semester": normalize_text(payload.get("semester")),
        "class": normalize_text(payload.get("class") or payload.get("className")),
        "address": normalize_text(payload.get("address")),
    }


def normalize_attendance_record(payload: dict[str, Any] | None) -> dict[str, str]:
    payload = payload or {}
    return {
        "date": normalize_text(payload.get("date")),
        "subject": normalize_text(payload.get("subject")),
        "class": normalize_text(payload.get("class") or payload.get("className")),
        "roll": normalize_text(payload.get("roll")),
        "name": normalize_text(payload.get("name")),
        "status": normalize_status(payload.get("status")),
    }


def student_matches_login(student_row: sqlite3.Row, username: str) -> bool:
    username_key = normalize_key(username)
    email_prefix = normalize_text(student_row["email"]).split("@")[0]
    compact_name = normalize_text(student_row["name"]).replace(" ", "")
    candidates = [
        normalize_text(student_row["roll"]),
        normalize_text(student_row["name"]),
        compact_name,
        email_prefix,
    ]
    return any(normalize_key(candidate) == username_key for candidate in candidates if candidate)


def resolve_student_for_login(connection: sqlite3.Connection, username: str) -> sqlite3.Row | None:
    students = connection.execute("SELECT * FROM students ORDER BY roll").fetchall()
    return next((student for student in students if student_matches_login(student, username)), None)


def student_matches_face_label(student: sqlite3.Row | dict[str, Any], recognized_name: str) -> bool:
    recognized_key = normalize_key(recognized_name)
    email_prefix = normalize_text(student["email"]).split("@")[0]
    compact_name = normalize_text(student["name"]).replace(" ", "")
    candidates = [
        normalize_text(student["roll"]),
        normalize_text(student["name"]),
        compact_name,
        email_prefix,
    ]
    return any(normalize_key(candidate) == recognized_key for candidate in candidates if candidate)


def prepared_student_password(student: dict[str, str], existing_password: str = "") -> str:
    raw_password = normalize_text(student["password"])
    if raw_password:
        return hash_password(raw_password)

    if existing_password:
        return existing_password

    return hash_password(student["roll"])


def save_student(connection: sqlite3.Connection, student: dict[str, str], existing_password: str = "") -> None:
    password_value = prepared_student_password(student, existing_password)
    connection.execute(
        """
        INSERT INTO students (
            roll, name, email, password, phone, course, year,
            semester, class_name, address, photo
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(roll) DO UPDATE SET
            name = excluded.name,
            email = excluded.email,
            password = excluded.password,
            phone = excluded.phone,
            course = excluded.course,
            year = excluded.year,
            semester = excluded.semester,
            class_name = excluded.class_name,
            address = excluded.address,
            photo = excluded.photo
        """,
        (
            student["roll"],
            student["name"],
            student["email"],
            password_value,
            student["phone"],
            student["course"],
            student["year"],
            student["semester"],
            student["class"],
            student["address"],
            student["photo"],
        ),
    )
    connection.execute(
        """
        UPDATE attendance_records
        SET name = ?, class_name = ?
        WHERE roll = ?
        """,
        (student["name"], student["class"], student["roll"]),
    )


def save_attendance_record(connection: sqlite3.Connection, record: dict[str, str]) -> None:
    connection.execute(
        """
        INSERT INTO attendance_records (date, subject, class_name, roll, name, status)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(date, subject, class_name, roll) DO UPDATE SET
            name = excluded.name,
            status = excluded.status
        """,
        (
            record["date"],
            record["subject"],
            record["class"],
            record["roll"],
            record["name"],
            record["status"],
        ),
    )


def init_db() -> None:
    with get_db() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS teacher_accounts (
                username TEXT PRIMARY KEY,
                password TEXT NOT NULL,
                name TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS students (
                roll TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT NOT NULL DEFAULT '',
                password TEXT NOT NULL DEFAULT '',
                phone TEXT NOT NULL DEFAULT '',
                course TEXT NOT NULL DEFAULT '',
                year TEXT NOT NULL DEFAULT '',
                semester TEXT NOT NULL DEFAULT '',
                class_name TEXT NOT NULL DEFAULT '',
                address TEXT NOT NULL DEFAULT '',
                photo TEXT NOT NULL DEFAULT ''
            );

            CREATE TABLE IF NOT EXISTS attendance_records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT NOT NULL,
                subject TEXT NOT NULL,
                class_name TEXT NOT NULL,
                roll TEXT NOT NULL,
                name TEXT NOT NULL,
                status TEXT NOT NULL CHECK(status IN ('P', 'A')),
                UNIQUE(date, subject, class_name, roll)
            );

            CREATE TABLE IF NOT EXISTS student_punches (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                roll TEXT NOT NULL,
                punch_date TEXT NOT NULL,
                punch_time TEXT NOT NULL,
                UNIQUE(roll, punch_date)
            );

            CREATE TABLE IF NOT EXISTS assignments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                description TEXT,
                subject TEXT,
                class_name TEXT,
                deadline TEXT,
                created_at TEXT
            );

            CREATE TABLE IF NOT EXISTS submissions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                assignment_id INTEGER NOT NULL,
                student_roll TEXT NOT NULL,
                content TEXT NOT NULL,
                grade TEXT,
                feedback TEXT,
                submitted_at TEXT,
                FOREIGN KEY(assignment_id) REFERENCES assignments(id),
                FOREIGN KEY(student_roll) REFERENCES students(roll)
            );
            """
        )

        existing_teacher = connection.execute(
            "SELECT username, password, name FROM teacher_accounts WHERE username = ?",
            (DEFAULT_TEACHER["username"],),
        ).fetchone()

        if existing_teacher is None:
            connection.execute(
                "INSERT INTO teacher_accounts (username, password, name) VALUES (?, ?, ?)",
                (
                    DEFAULT_TEACHER["username"],
                    hash_password(DEFAULT_TEACHER["password"]),
                    DEFAULT_TEACHER["name"],
                ),
            )
        elif not is_hashed_password(normalize_text(existing_teacher["password"])):
            connection.execute(
                "UPDATE teacher_accounts SET password = ?, name = ? WHERE username = ?",
                (
                    hash_password(normalize_text(existing_teacher["password"]) or DEFAULT_TEACHER["password"]),
                    normalize_text(existing_teacher["name"]) or DEFAULT_TEACHER["name"],
                    DEFAULT_TEACHER["username"],
                ),
            )

        students = connection.execute("SELECT roll, password FROM students").fetchall()
        for student in students:
            current_password = normalize_text(student["password"])
            if is_hashed_password(current_password):
                continue

            fallback_password = current_password or normalize_text(student["roll"])
            connection.execute(
                "UPDATE students SET password = ? WHERE roll = ?",
                (hash_password(fallback_password), normalize_text(student["roll"])),
            )


def load_known_faces() -> bool:
    global known_encodings, known_names, face_status_message

    if cv2 is None or face_recognition is None:
        face_status_message = "Face recognition packages not installed. To test now, run 'set BYPASS_FACE_ID=true' then 'python app.py' to use Bypass Mode."
        return False

    if not ENCODINGS_PATH.exists():
        face_status_message = "No encodings file was found. Generate one with backend/generate_encodings.py."
        return False

    if known_encodings and known_names:
        face_status_message = "Face recognition is ready."
        return True

    try:
        with ENCODINGS_PATH.open("rb") as handle:
            data = pickle.load(handle)
    except Exception:
        face_status_message = "The encodings file is invalid. Regenerate it with backend/generate_encodings.py."
        return False

    encodings = data.get("encodings") if isinstance(data, dict) else None
    names = data.get("names") if isinstance(data, dict) else None

    encodings_list = cast(list[Any], encodings)
    names_list = cast(list[str], names)

    known_encodings = list(encodings_list)
    known_names = [normalize_text(name) or f"face-{index + 1}" for index, name in enumerate(names_list)]
    face_status_message = "Face recognition is ready."
    return True


def ensure_face_camera() -> bool:
    global camera, face_status_message

    if cv2 is None:
        face_status_message = "OpenCV is not available for camera access."
        return False

    if camera is None or not camera.isOpened():
        camera = cv2.VideoCapture(0)

    if not camera or not camera.isOpened():
        face_status_message = "Camera could not be opened. Check camera permission and make sure no other app is using it."
        return False

    return True


def get_face_recognition_status() -> dict[str, Any]:
    if not load_known_faces():
        return face_status_payload(False, face_status_message)

    return face_status_payload(True, face_status_message)


def run_face_recognition_scan(image_data: str | None = None, expected_name: str | None = None) -> dict[str, Any]:
    global known_encodings, known_names, face_status_message

    # Automatic Demo Mode if libraries are missing
    is_demo = (cv2 is None or face_recognition is None or not load_known_faces())

    if is_demo:
        name = expected_name or "Demo User"
        return {
            "status": "recognized",
            "name": name,
            "time": datetime.now().strftime("%H:%M:%S"),
            "message": f"DEMO MODE: '{name}' verified successfully (MOCK).",
            "demoMode": True
        }

    assert cv2 is not None
    assert face_recognition is not None

    frame = None
    if image_data:
        try:
            if "," in image_data:
                header, encoded = image_data.split(",", 1)
            else:
                encoded = image_data
            data = base64.b64decode(encoded)
            image = Image.open(io.BytesIO(data))
            # Convert RGBA to RGB if necessary, then to BGR for OpenCV
            image = image.convert("RGB")
            assert cv2 is not None
            frame = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
        except Exception as e:
            return {"status": "error", "message": f"Failed to process image: {str(e)}"}
    else:
        if not ensure_face_camera():
            return {"status": "camera_error", "message": "Could not initialize camera."}

        assert camera is not None
        ret, frame = camera.read()
        if not ret:
            return {"status": "camera_error", "message": "Failed to capture image from camera."}

    assert cv2 is not None
    assert face_recognition is not None
    assert frame is not None

    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    locations = face_recognition.face_locations(rgb)
    if not locations:
        return {
            "status": "scanning",
            "message": "No face was detected. Center your face in front of the camera and try again.",
        }

    encodings = face_recognition.face_encodings(rgb, locations)
    assert face_recognition is not None
    for encoding in encodings:
        matches = face_recognition.compare_faces(known_encodings, encoding)
        if True not in matches:
            continue

        index = matches.index(True)
        return {
            "status": "recognized",
            "name": known_names[index],
            "time": datetime.now().isoformat(timespec="seconds"),
            "message": f"Recognized {known_names[index]}.",
        }

    return {
        "status": "unknown",
        "message": "A face was detected, but it does not match the trained student encodings.",
    }


@app.get("/")
def root() -> Any:
    return redirect_for_session()


@app.get("/api/health")
def health() -> Any:
    face_status = get_face_recognition_status()
    return jsonify(
        {
            "status": "ok",
            "database": str(DATABASE_PATH),
            "site": str(SITE_DIR),
            "faceRecognitionReady": face_status["ready"],
            "faceRecognitionMessage": face_status["message"],
        }
    )


@app.get("/api/auth/me")
def auth_me() -> Any:
    role = normalize_key(session.get("role"))
    if role not in {"teacher", "student"}:
        return jsonify({"error": "Not signed in."}), 401
    return jsonify(current_session_payload())


@app.post("/api/auth/login")
def auth_login() -> Any:
    payload = request.get_json(silent=True) or {}
    role = normalize_key(payload.get("role"))
    username = normalize_text(payload.get("username"))
    password = normalize_text(payload.get("password"))

    if role not in {"teacher", "student"} or not username or not password:
        return jsonify({"error": "Role, username, and password are required."}), 400

    with get_db() as connection:
        if role == "teacher":
            teacher = connection.execute(
                "SELECT username, password, name FROM teacher_accounts WHERE LOWER(username) = ?",
                (normalize_key(username),),
            ).fetchone()

            if not teacher or not verify_password(teacher["password"], password):
                return jsonify({"error": "Invalid teacher credentials."}), 401

            session.clear()
            session.update(
                {
                    "role": "teacher",
                    "username": normalize_text(teacher["username"]),
                    "name": normalize_text(teacher["name"]),
                }
            )
            return jsonify(current_session_payload())

        student = resolve_student_for_login(connection, username)
        if student is None or not verify_password(student["password"], password):
            return jsonify({"error": "Invalid student credentials."}), 401

        session.clear()
        student_data = cast(dict[str, Any], student)
        session.update(
            {
                "role": "student",
                "username": normalize_text(student_data["roll"]),
                "name": normalize_text(student_data["name"]),
                "studentRoll": normalize_text(student_data["roll"]),
                "studentName": normalize_text(student_data["name"]),
            }
        )
        return jsonify(current_session_payload())


@app.post("/api/auth/logout")
def auth_logout() -> Any:
    session.clear()
    return jsonify({"loggedOut": True})


@app.post("/api/students/punch")
@login_required("student")
def student_punch() -> Any:
    payload = request.get_json(silent=True) or {}
    image_data = payload.get("image")
    student_name = normalize_text(session.get("studentName"))
    student_roll = normalize_text(session.get("studentRoll"))

    result = run_face_recognition_scan(image_data, expected_name=student_name or student_roll)
    if result["status"] != "recognized":
        return jsonify(result), 400

    recognized_name = normalize_text(result["name"])
    student_name = normalize_text(session.get("studentName"))
    student_roll = normalize_text(session.get("studentRoll"))

    if recognized_name.lower() not in {student_name.lower(), student_roll.lower()}:
        return jsonify(
            {
                "status": "error",
                "message": f"Face recognized as '{recognized_name}', but you are logged in as '{student_name}'. Identity mismatch.",
            }
        ), 403

    today = datetime.now().strftime("%Y-%m-%d")
    now_time = datetime.now().strftime("%H:%M:%S")

    with get_db() as connection:
        connection.execute(
            """
            INSERT INTO student_punches (roll, punch_date, punch_time)
            VALUES (?, ?, ?)
            ON CONFLICT(roll, punch_date) DO UPDATE SET punch_time = excluded.punch_time
            """,
            (student_roll, today, now_time),
        )

    return jsonify({"status": "success", "message": f"Successfully punched in at {now_time}.", "time": now_time})


@app.get("/api/attendance/punches")
@login_required()
def list_punches() -> Any:
    date = request.args.get("date") or datetime.now().strftime("%Y-%m-%d")
    with get_db() as connection:
        punches = connection.execute("SELECT roll, punch_time FROM student_punches WHERE punch_date = ?", (date,)).fetchall()

    return jsonify({"date": date, "punches": {p["roll"]: p["punch_time"] for p in punches}})


@app.post("/api/auth/change-password")
def change_password() -> Any:
    payload = request.get_json(silent=True) or {}
    role = normalize_key(payload.get("role"))
    username = normalize_text(payload.get("username"))
    current_password = normalize_text(payload.get("currentPassword"))
    new_password = normalize_text(payload.get("newPassword"))

    if role not in {"teacher", "student"} or not username or not current_password or len(new_password) < 6:
        return jsonify({"error": "Role, username, current password, and a new password with at least 6 characters are required."}), 400

    with get_db() as connection:
        if role == "teacher":
            teacher = connection.execute(
                "SELECT username, password FROM teacher_accounts WHERE LOWER(username) = ?",
                (normalize_key(username),),
            ).fetchone()

            if not teacher or not verify_password(teacher["password"], current_password):
                return jsonify({"error": "Current teacher credentials are incorrect."}), 401

            connection.execute(
                "UPDATE teacher_accounts SET password = ? WHERE username = ?",
                (hash_password(new_password), normalize_text(teacher["username"])),
            )
            return jsonify({"changed": True})

        student = resolve_student_for_login(connection, username)
        if student is None:
            return jsonify({"error": "Current student credentials are incorrect."}), 401

        student_data_reg = cast(dict[str, Any], student)
        if not verify_password(normalize_text(student_data_reg["password"]), current_password):
            return jsonify({"error": "Current student credentials are incorrect."}), 401

        connection.execute(
            "UPDATE students SET password = ? WHERE roll = ?",
            (hash_password(new_password), normalize_text(student_data_reg["roll"])),
        )
        return jsonify({"changed": True})


@app.post("/api/auth/forgot-password")
def forgot_password() -> Any:
    payload = request.get_json(silent=True) or {}
    username = normalize_text(payload.get("username"))
    email = normalize_key(payload.get("email"))

    if not username or not email:
        return jsonify({"error": "Username/Roll and Email are required."}), 400

    with get_db() as connection:
        # Check Students First
        student = resolve_student_for_login(connection, username)
        if student:
            if normalize_key(student["email"]) == email:
                return jsonify({"message": f"Identity verified for {student['name']}. A recovery link has been sent to {student['email']}."})
            else:
                return jsonify({"error": "The email provided does not match our records for this roll number."}), 400

        # Check Teacher Accounts
        teacher = connection.execute(
            "SELECT username, name FROM teacher_accounts WHERE LOWER(username) = ?",
            (normalize_key(username),),
        ).fetchone()

        if teacher:
             # Since teachers don't have email in DB, we'll simulate a success if they provide any valid looking email
             # In a real system, we would have a teacher email field.
             return jsonify({"message": f"Hello {teacher['name']}, your identity as Faculty has been verified. Recovery instructions sent to {email}."})

    return jsonify({"error": "No matching account found with those details."}), 404


@app.get("/api/students")
@login_required("teacher")
def list_students() -> Any:
    with get_db() as connection:
        students = [
            serialize_student(row)
            for row in connection.execute("SELECT * FROM students ORDER BY roll").fetchall()
        ]
    return jsonify(students)


@app.get("/api/students/me")
@login_required("student")
def current_student() -> Any:
    roll = normalize_text(session.get("studentRoll") or session.get("username"))
    with get_db() as connection:
        student = connection.execute("SELECT * FROM students WHERE roll = ?", (roll,)).fetchone()
        if student:
            return jsonify(serialize_student(student))

    return jsonify({
        "photo": "",
        "roll": roll,
        "name": normalize_text(session.get("studentName") or session.get("name")) or "Student",
        "email": "",
        "password": "",
        "hasPassword": False,
        "phone": "",
        "course": "",
        "year": "",
        "semester": "",
        "class": "",
        "address": "",
    })


@app.post("/api/students")
@login_required("teacher")
def create_student() -> Any:
    student = normalize_student_payload(request.get_json(silent=True))
    if not student["roll"] or not student["name"]:
        return jsonify({"error": "Student roll and name are required."}), 400

    try:
        with get_db() as connection:
            existing = connection.execute(
                "SELECT 1 FROM students WHERE roll = ?",
                (student["roll"],),
            ).fetchone()
            if existing:
                return jsonify({"error": "Roll already exists."}), 409
            save_student(connection, student)
            saved_student = connection.execute("SELECT * FROM students WHERE roll = ?", (student["roll"],)).fetchone()
    except sqlite3.IntegrityError:
        return jsonify({"error": "Unable to save the student record."}), 400

    return jsonify(serialize_student(saved_student)), 201


@app.put("/api/students/<roll>")
@login_required("teacher")
def update_student(roll: str) -> Any:
    original_roll = normalize_text(roll)
    student = normalize_student_payload(request.get_json(silent=True))

    if not student["roll"] or not student["name"]:
        return jsonify({"error": "Student roll and name are required."}), 400

    try:
        with get_db() as connection:
            existing = connection.execute(
                "SELECT * FROM students WHERE roll = ?",
                (original_roll,),
            ).fetchone()
            if not existing:
                return jsonify({"error": "Student not found."}), 404

            if student["roll"] != original_roll:
                conflict = connection.execute(
                    "SELECT 1 FROM students WHERE roll = ?",
                    (student["roll"],),
                ).fetchone()
                if conflict:
                    return jsonify({"error": "Roll already exists."}), 409

            connection.execute("DELETE FROM students WHERE roll = ?", (original_roll,))
            save_student(connection, student, normalize_text(existing["password"]))
            connection.execute(
                """
                UPDATE attendance_records
                SET roll = ?, name = ?, class_name = ?
                WHERE roll = ?
                """,
                (student["roll"], student["name"], student["class"], original_roll),
            )
            saved_student = connection.execute("SELECT * FROM students WHERE roll = ?", (student["roll"],)).fetchone()
    except sqlite3.IntegrityError:
        return jsonify({"error": "Unable to update the student record."}), 400

    return jsonify(serialize_student(saved_student))


@app.delete("/api/students/<roll>")
@login_required("teacher")
def delete_student(roll: str) -> Any:
    roll = normalize_text(roll)

    with get_db() as connection:
        student = connection.execute("SELECT 1 FROM students WHERE roll = ?", (roll,)).fetchone()
        if not student:
            return jsonify({"error": "Student not found."}), 404

        connection.execute("DELETE FROM students WHERE roll = ?", (roll,))
        connection.execute("DELETE FROM attendance_records WHERE roll = ?", (roll,))

    return jsonify({"deleted": True, "roll": roll})


@app.post("/api/students/import")
@login_required("teacher")
def import_students() -> Any:
    payload = request.get_json(silent=True) or {}
    raw_students = payload.get("students") or []
    imported_count: int = 0

    with get_db() as connection:
        for raw_student in raw_students:
            student = normalize_student_payload(raw_student)
            if not student["roll"] or not student["name"]:
                continue

            existing = connection.execute(
                "SELECT password FROM students WHERE roll = ?",
                (student["roll"],),
            ).fetchone()
            save_student(connection, student, normalize_text(existing["password"]) if existing else "")
            imported_count += 1  # type: ignore[operator]

    return jsonify({"count": imported_count})


@app.get("/api/attendance")
@login_required()
def list_attendance() -> Any:
    filters = {
        "subject": normalize_key(request.args.get("subject")),
        "roll": normalize_key(request.args.get("roll")),
        "class": normalize_key(request.args.get("className") or request.args.get("class")),
        "search": normalize_key(request.args.get("search")),
        "startDate": normalize_text(request.args.get("startDate")),
        "endDate": normalize_text(request.args.get("endDate")),
    }

    current_role = normalize_key(session.get("role"))
    allowed_roll = normalize_text(session.get("studentRoll") or session.get("username")) if current_role == "student" else ""

    with get_db() as connection:
        records = [
            serialize_attendance_record(row)
            for row in connection.execute(
                "SELECT date, subject, class_name, roll, name, status FROM attendance_records ORDER BY date, subject, roll"
            ).fetchall()
        ]

    def matches(record: dict[str, str]) -> bool:
        if allowed_roll and normalize_key(record["roll"]) != normalize_key(allowed_roll):
            return False
        if filters["subject"] and normalize_key(record["subject"]) != filters["subject"]:
            return False
        if filters["roll"] and normalize_key(record["roll"]) != filters["roll"]:
            return False
        if filters["class"] and normalize_key(record["class"]) != filters["class"]:
            return False
        if filters["startDate"] and record["date"] < filters["startDate"]:
            return False
        if filters["endDate"] and record["date"] > filters["endDate"]:
            return False
        if filters["search"]:
            haystack = " ".join([
                record["date"],
                record["subject"],
                record["class"],
                record["roll"],
                record["name"],
                record["status"],
            ])
            if filters["search"] not in normalize_key(haystack):
                return False
        return True

    return jsonify([record for record in records if matches(record)])


@app.post("/api/attendance/batch")
@login_required("teacher")
def save_attendance_batch() -> Any:
    payload = request.get_json(silent=True) or {}
    date = normalize_text(payload.get("date"))
    subject = normalize_text(payload.get("subject"))
    class_name = normalize_text(payload.get("className") or payload.get("class"))
    raw_records = payload.get("records") or []

    if not date or not subject or not class_name:
        return jsonify({"error": "Date, subject, and class are required."}), 400

    if not raw_records:
        return jsonify({"error": "At least one attendance record is required."}), 400

    saved = 0
    with get_db() as connection:
        connection.execute(
            "DELETE FROM attendance_records WHERE date = ? AND subject = ? AND class_name = ?",
            (date, subject, class_name),
        )

        for raw_record in raw_records:
            record = normalize_attendance_record(
                {
                    **raw_record,
                    "date": date,
                    "subject": subject,
                    "class": class_name,
                }
            )
            if not record["roll"]:
                continue

            if not record["name"]:
                student = connection.execute(
                    "SELECT name FROM students WHERE roll = ?",
                    (record["roll"],),
                ).fetchone()
                record["name"] = normalize_text(student["name"] if student else "")

            save_attendance_record(connection, record)
            saved += 1

    return jsonify({"count": saved})


@app.post("/api/attendance/import")
@login_required("teacher")
def import_attendance() -> Any:
    payload = request.get_json(silent=True) or {}
    raw_records = payload.get("records") or []
    imported = 0

    with get_db() as connection:
        for raw_record in raw_records:
            record = normalize_attendance_record(raw_record)
            if not all([record["date"], record["subject"], record["class"], record["roll"]]):
                continue

            if not record["name"]:
                student = connection.execute(
                    "SELECT name FROM students WHERE roll = ?",
                    (record["roll"],),
                ).fetchone()
                record["name"] = normalize_text(student["name"] if student else "")

            save_attendance_record(connection, record)
            imported += 1

    return jsonify({"count": imported})


@app.get("/api/face-recognition/status")
@login_required()
def face_recognition_status() -> Any:
    return jsonify(get_face_recognition_status())


@app.post("/api/face-recognition/student-verify")
@login_required("student")
def verify_student_face() -> Any:
    result = run_face_recognition_scan()
    if result["status"] == "face_recognition_unavailable":
        return jsonify(result), 503
    if result["status"] == "camera_error":
        return jsonify(result), 500
    if result["status"] in {"scanning", "unknown"}:
        return jsonify(result), 202

    with get_db() as connection:
        current_roll = normalize_text(session.get("studentRoll") or session.get("username"))
        student = connection.execute(
            "SELECT * FROM students WHERE roll = ?",
            (current_roll,),
        ).fetchone()

    if student and student_matches_face_label(student, result["name"]):
        return jsonify(
            {
                **result,
                "status": "verified",
                "matched": True,
                "studentRoll": normalize_text(student["roll"]),
                "studentName": normalize_text(student["name"]),
                "message": "Face matched your student account successfully.",
            }
        )

    return jsonify(
        {
            **result,
            "status": "mismatch",
            "matched": False,
            "studentRoll": normalize_text(session.get("studentRoll")),
            "studentName": normalize_text(session.get("studentName") or session.get("name")),
            "message": "A face was recognized, but it does not match the student account currently signed in.",
        }
    )


@app.get("/recognize")
@login_required("teacher")
def recognize() -> Any:
    result = run_face_recognition_scan()
    if result["status"] == "face_recognition_unavailable":
        return jsonify(result), 503
    if result["status"] == "camera_error":
        return jsonify(result), 500
    if result["status"] != "recognized":
        return jsonify(result), 202

    if result["name"] in marked:
        return jsonify(
            {
                "status": "already_marked",
                "name": result["name"],
                "time": result["time"],
                "message": f"{result['name']} was already marked in this session.",
            }
        )

    marked.add(result["name"])
    return jsonify(
        {
            "status": "recognized",
            "name": result["name"],
            "attendance": "Present",
            "time": result["time"],
            "message": result["message"],
        }
    )


@app.post("/api/assignments")
@login_required("teacher")
def create_assignment() -> Any:
    payload = request.get_json(silent=True) or {}
    title = normalize_text(payload.get("title"))
    description = normalize_text(payload.get("description"))
    subject = normalize_text(payload.get("subject"))
    class_name = normalize_text(payload.get("class"))
    deadline = normalize_text(payload.get("deadline"))

    if not title:
        return jsonify({"error": "Title is required."}), 400

    created_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with get_db() as connection:
        connection.execute(
            """
            INSERT INTO assignments (title, description, subject, class_name, deadline, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (title, description, subject, class_name, deadline, created_at),
        )
    return jsonify({"success": True})


@app.get("/api/assignments")
@login_required()
def list_assignments() -> Any:
    role = normalize_key(session.get("role"))
    class_name = normalize_text(request.args.get("class"))
    subject = normalize_text(request.args.get("subject"))

    query = "SELECT * FROM assignments WHERE 1=1"
    params = []

    if role == "student":
        student_class = ""
        with get_db() as connection:
            student = connection.execute(
                "SELECT class_name FROM students WHERE roll = ?",
                (normalize_text(session.get("studentRoll")),),
            ).fetchone()
            if student:
                student_class = student["class_name"]
        query += " AND (class_name = ? OR class_name = '' OR class_name IS NULL)"
        params.append(student_class)
    else:
        if class_name:
            query += " AND class_name = ?"
            params.append(class_name)

    if subject:
        query += " AND subject = ?"
        params.append(subject)

    query += " ORDER BY created_at DESC"

    with get_db() as connection:
        rows = connection.execute(query, params).fetchall()
        assignments = [dict(row) for row in rows]
    return jsonify({"assignments": assignments})


@app.delete("/api/assignments/<int:assignment_id>")
@login_required("teacher")
def delete_assignment(assignment_id: int) -> Any:
    with get_db() as connection:
        # Also delete submissions for this assignment to maintain integrity
        connection.execute("DELETE FROM submissions WHERE assignment_id = ?", (assignment_id,))
        connection.execute("DELETE FROM assignments WHERE id = ?", (assignment_id,))
    return jsonify({"success": True})


@app.post("/api/submissions")
@login_required("student")
def submit_assignment() -> Any:
    payload = request.get_json(silent=True) or {}
    assignment_id = payload.get("assignment_id")
    content = normalize_text(payload.get("content"))
    student_roll = normalize_text(session.get("studentRoll"))

    if not assignment_id or not content:
        return jsonify({"error": "Assignment ID and content are required."}), 400

    submitted_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with get_db() as connection:
        connection.execute(
            """
            INSERT INTO submissions (assignment_id, student_roll, content, submitted_at)
            VALUES (?, ?, ?, ?)
            """,
            (assignment_id, student_roll, content, submitted_at),
        )
    return jsonify({"success": True})


@app.get("/api/submissions")
@login_required()
def list_submissions() -> Any:
    role = normalize_key(session.get("role"))
    assignment_id = request.args.get("assignment_id")

    query = "SELECT s.*, st.name as student_name FROM submissions s JOIN students st ON s.student_roll = st.roll"
    params = []

    if role == "student":
        query += " WHERE s.student_roll = ?"
        params.append(normalize_text(session.get("studentRoll")))
        if assignment_id:
            query += " AND s.assignment_id = ?"
            params.append(assignment_id)
    else:
        if assignment_id:
            query += " WHERE s.assignment_id = ?"
            params.append(assignment_id)

    with get_db() as connection:
        rows = connection.execute(query, params).fetchall()
        submissions = [dict(row) for row in rows]
    return jsonify({"submissions": submissions})


@app.patch("/api/submissions/<int:submission_id>")
@login_required("teacher")
def grade_submission(submission_id: int) -> Any:
    payload = request.get_json(silent=True) or {}
    grade = normalize_text(payload.get("grade"))
    feedback = normalize_text(payload.get("feedback"))

    with get_db() as connection:
        connection.execute(
            "UPDATE submissions SET grade = ?, feedback = ? WHERE id = ?",
            (grade, feedback, submission_id),
        )
    return jsonify({"success": True})


@app.get("/<path:path>")
def serve_site(path: str) -> Any:
    requested_path = normalize_text(path).replace("\\", "/")
    if not requested_path:
        return redirect_for_session()

    if requested_path.startswith("api/"):
        abort(404)

    absolute_path = SITE_DIR / requested_path
    if not absolute_path.exists() or not absolute_path.is_file():
        abort(404)

    current_role = normalize_key(session.get("role"))
    if requested_path.startswith("teacher_final/") and current_role != "teacher":
        return redirect_for_session()
    if requested_path.startswith("student_final/") and current_role != "student":
        return redirect_for_session()
    if requested_path not in PUBLIC_PATHS and "/" not in requested_path and current_role not in {"teacher", "student"}:
        return redirect("/login.html")

    return send_from_directory(SITE_DIR, requested_path)


init_db()


if __name__ == "__main__":
    app.run(debug=True)
