# Manual Test Checklist

## Launch
1. Start the backend with `backend/start_backend.ps1`.
2. Open `http://127.0.0.1:5000/`.
3. Confirm the login page loads.

## Teacher Flow
1. Sign in with `teacher / admin123`.
2. Open `Manage Students`.
3. Add one student with a custom password.
4. Add a second student with the password left blank.
5. Edit the first student without changing the password and confirm the update saves.
6. Import one or more students from CSV.
7. Delete one student and confirm the table refreshes.

## Attendance Flow
1. Open `Mark Attendance`.
2. Select a class, subject, and date.
3. Mark a mix of `Present` and `Absent`.
4. Save attendance and reload the page.
5. Confirm the saved statuses still appear.
6. Open `View Attendance` and confirm the records and summary are correct.
7. Export CSV.
8. Export PDF.

## Student Flow
1. Sign out.
2. Sign in as a student using roll number or email prefix.
3. Confirm the profile page shows only that student.
4. Open `View Attendance` and confirm only that student's records are visible.
5. On the profile dashboard, confirm the Face Recognition card shows a clear ready or setup-needed status.
6. If encodings and camera are configured, click `Verify With Face ID` and confirm the result shows `Verified`, `Mismatch`, or a helpful scan message.

## Password Flow
1. Open `Forgot password?` from the login page.
2. Change the teacher or student password using the current password.
3. Sign in again with the new password.
4. Confirm the old password no longer works.

## Session Flow
1. While signed in, open a teacher page URL directly.
2. Confirm it loads without browser-side login flags.
3. Sign out from the logout screen.
4. Try to reopen the protected page URL.
5. Confirm you are redirected to login.

## Face Recognition
1. Visit `/recognize` only after the optional face-recognition packages and encodings file are ready.
2. Confirm the endpoint returns `face_recognition_unavailable` until that optional setup is complete.
3. Confirm the student profile dashboard shows the same readiness state before any scan starts.
