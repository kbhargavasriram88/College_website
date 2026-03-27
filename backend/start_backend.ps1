param(
  [switch]$InstallFaceRecognition
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path ".\.venv\Scripts\python.exe")) {
  .\setup_backend.ps1 -InstallFaceRecognition:$InstallFaceRecognition
}

& .\.venv\Scripts\python.exe .\app.py
