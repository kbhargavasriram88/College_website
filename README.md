# 🎯 Smart Attendance & Elite Assignment Portal

A Premium SaaS-based College Management Solution featuring **"Smart" Face-Recognition Authentication** and an **Extreme Premium v3 UI/UX**.

## 🚀 Presentation Features
- **Student Dashboard**: Glassmorphic UI with real-time stats and subject tags.
- **Elite Assignments**: 3D hover effects, submission tracking, and grading lifecycle.
- **Admin Control**: Bulk CSV import for students and full faculty oversight.
- **Identity Security**: Integrated "Identity Verification" via Facial Landmarks (dlib).

## 🛠️ Step-by-Step Execution Guide

### 1. Installation
Ensure Python 3.8+ is installed. Clone the repository and install dependencies:
```bash
pip install -r requirements.txt
```

### 2. Local Execution
Run the Flask server:
```bash
cd backend
python app.py
```
Access the dashboard at: `http://127.0.0.1:5000`

### 3. Deployment
This project is configured for **Render.com** and **Railway.app** via the included `Procfile` and `requirements.txt`. 

## 🏗️ Technical Stack
- **Frontend**: Vanilla JS, HTML5, CSS3 (Glassmorphism v3).
- **Backend**: Python 3.9+, Flask, Flask-CORS.
- **Database**: SQLite3 (Local, lightweight, relational).
- **Computer Vision**: OpenCV, Face-Recognition (dlib).

