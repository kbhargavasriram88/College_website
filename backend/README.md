# Backend Setup

## Quick Start
1. Install Python 3.11 or newer.
2. Open PowerShell in `backend`.
3. Run `./setup_backend.ps1`.
4. Start the site with `./start_backend.ps1`.
5. Open `http://127.0.0.1:5000/` in your browser.

## Optional Face Recognition
- Install the extra packages with `./setup_backend.ps1 -InstallFaceRecognition`.
- Add student face images under `backend/dataset/<student_name_or_roll>/`.
- Build the trained encodings with `.\.venv\Scripts\python.exe .\generate_encodings.py`.
- After that, students can open the profile dashboard and use the `Verify With Face ID` card.
- The main attendance website does not need these packages to run.

## Default Teacher Login
- Username: `teacher`
- Password: `admin123`

## Automated Tests
Run:

```powershell
.\.venv\Scripts\python.exe -m unittest .\test_api.py
```

## Notes
- The SQLite database is created automatically at `backend/smart_attendance.db`.
- The session secret is generated automatically at `backend/secret.key` on first run.
- Student passwords are stored as hashes in the database.
