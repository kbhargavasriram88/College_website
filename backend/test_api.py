import importlib
import os
import tempfile
import unittest
from pathlib import Path


class AttendanceApiTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        os.environ["SMART_ATTENDANCE_DB_PATH"] = str(Path(self.temp_dir.name) / "test.db")
        os.environ["SMART_ATTENDANCE_SECRET_PATH"] = str(Path(self.temp_dir.name) / "secret.key")

        import app as app_module  # pylint: disable=import-outside-toplevel

        app_module = importlib.reload(app_module)
        self.app_module = app_module
        self.app = app_module.app
        self.client = self.app.test_client()
        app_module.init_db()

    def tearDown(self):
        self.temp_dir.cleanup()
        os.environ.pop("SMART_ATTENDANCE_DB_PATH", None)
        os.environ.pop("SMART_ATTENDANCE_SECRET_PATH", None)

    def login_teacher(self):
        response = self.client.post(
            "/api/auth/login",
            json={"role": "teacher", "username": "teacher", "password": "admin123"},
        )
        self.assertEqual(response.status_code, 200)
        return response.get_json()

    def test_teacher_login(self):
        payload = self.login_teacher()
        self.assertEqual(payload["role"], "teacher")

    def test_teacher_can_create_student(self):
        self.login_teacher()
        response = self.client.post(
            "/api/students",
            json={"roll": "101", "name": "Asha Devi", "class": "CSE-A"},
        )
        self.assertEqual(response.status_code, 201)
        student = response.get_json()
        self.assertEqual(student["roll"], "101")
        self.assertEqual(student["password"], "")

    def test_student_attendance_is_scoped(self):
        self.login_teacher()
        self.client.post(
            "/api/students/import",
            json={
                "students": [
                    {"roll": "101", "name": "Asha Devi", "password": "asha123", "class": "CSE-A"},
                    {"roll": "102", "name": "Rohan Das", "password": "rohan123", "class": "CSE-A"},
                ]
            },
        )
        self.client.post(
            "/api/attendance/batch",
            json={
                "date": "2026-03-22",
                "subject": "Math",
                "className": "CSE-A",
                "records": [
                    {"roll": "101", "name": "Asha Devi", "status": "P"},
                    {"roll": "102", "name": "Rohan Das", "status": "A"},
                ],
            },
        )
        self.client.post("/api/auth/logout")
        response = self.client.post(
            "/api/auth/login",
            json={"role": "student", "username": "101", "password": "asha123"},
        )
        self.assertEqual(response.status_code, 200)
        attendance = self.client.get("/api/attendance").get_json()
        self.assertEqual(len(attendance), 1)
        self.assertEqual(attendance[0]["roll"], "101")

    def test_password_change(self):
        self.login_teacher()
        response = self.client.post(
            "/api/auth/change-password",
            json={
                "role": "teacher",
                "username": "teacher",
                "currentPassword": "admin123",
                "newPassword": "teacher456",
            },
        )
        self.assertEqual(response.status_code, 200)
        self.client.post("/api/auth/logout")
        relogin = self.client.post(
            "/api/auth/login",
            json={"role": "teacher", "username": "teacher", "password": "teacher456"},
        )
        self.assertEqual(relogin.status_code, 200)

    def test_student_face_verification_matches_logged_in_student(self):
        self.login_teacher()
        self.client.post(
            "/api/students/import",
            json={
                "students": [
                    {"roll": "101", "name": "Asha Devi", "password": "asha123", "email": "asha@example.com", "class": "CSE-A"},
                ]
            },
        )
        self.client.post("/api/auth/logout")
        login_response = self.client.post(
            "/api/auth/login",
            json={"role": "student", "username": "101", "password": "asha123"},
        )
        self.assertEqual(login_response.status_code, 200)

        original_scan = self.app_module.run_face_recognition_scan
        self.app_module.run_face_recognition_scan = lambda: {
            "status": "recognized",
            "name": "Asha Devi",
            "time": "2026-03-22T12:00:00",
            "message": "Recognized Asha Devi.",
        }
        try:
            response = self.client.post("/api/face-recognition/student-verify")
        finally:
            self.app_module.run_face_recognition_scan = original_scan

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload["status"], "verified")
        self.assertTrue(payload["matched"])
        self.assertEqual(payload["studentRoll"], "101")


if __name__ == "__main__":
    unittest.main()
