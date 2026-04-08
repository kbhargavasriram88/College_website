# Use a Python base image with build tools for dlib
FROM python:3.10-slim-bullseye

# Install system dependencies for dlib, opencv, and git
RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    libopenblas-dev \
    liblapack-dev \
    libx11-6 \
    libgl1-mesa-glx \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application
COPY . .

# Create directory for persistent data
RUN mkdir -p /app/data

# Environment variables for production
ENV FLASK_APP=backend.app:app
ENV SMART_ATTENDANCE_DB_PATH=/app/data/smart_attendance.db
ENV SMART_ATTENDANCE_SECRET_PATH=/app/data/secret.key

# Expose port
EXPOSE 10000

# Start command
CMD ["gunicorn", "--bind", "0.0.0.0:10000", "backend.app:app"]
