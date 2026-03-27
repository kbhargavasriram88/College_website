param(
  [string]$PythonExe = "python",
  [switch]$InstallFaceRecognition
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command $PythonExe -ErrorAction SilentlyContinue)) {
  throw "Python was not found. Install Python 3.11+ first or pass -PythonExe with the full path to python.exe."
}

if (-not (Test-Path ".\.venv\Scripts\python.exe")) {
  & $PythonExe -m venv .\.venv
}

& .\.venv\Scripts\python.exe -m pip install --upgrade pip
& .\.venv\Scripts\python.exe -m pip install -r .\requirements.txt

if ($InstallFaceRecognition) {
  & .\.venv\Scripts\python.exe -m pip install -r .\requirements-face-recognition.txt
}

Write-Host "Backend environment is ready. Start it with .\\start_backend.ps1"
