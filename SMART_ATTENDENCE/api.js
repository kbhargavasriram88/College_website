(function () {
  const DEFAULT_API_BASE = window.location.origin && window.location.origin.startsWith("http")
    ? `${window.location.origin}/api`
    : "http://127.0.0.1:5000/api";

  let legacySyncPromise = null;
  let sessionPromise = null;

  function getBaseUrl() {
    return String(window.SMART_ATTENDANCE_API_URL || DEFAULT_API_BASE).replace(/\/$/, "");
  }

  async function request(path, options = {}) {
    const requestOptions = {
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      },
      ...options
    };

    if (requestOptions.body && typeof requestOptions.body !== "string") {
      requestOptions.body = JSON.stringify(requestOptions.body);
    }

    let response;
    try {
      response = await fetch(`${getBaseUrl()}${path}`, requestOptions);
    } catch (error) {
      throw new Error("Cannot reach the backend. Start the Flask server and open the site from http://127.0.0.1:5000/.");
    }

    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json")
      ? await response.json()
      : await response.text();

    if (response.status === 401) {
      sessionPromise = null;
    }

    if (!response.ok) {
      const message = typeof payload === "string"
        ? payload
        : payload?.message || payload?.error || `Request failed with status ${response.status}.`;
      throw new Error(message);
    }

    return payload;
  }

  function buildQuery(params = {}) {
    const searchParams = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") {
        return;
      }
      searchParams.set(key, value);
    });

    const queryString = searchParams.toString();
    return queryString ? `?${queryString}` : "";
  }

  function parseStoredArray(key) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  function clearLegacySessionHints() {
    ["isLoggedIn", "role", "username", "studentRoll", "studentName"].forEach(key => {
      localStorage.removeItem(key);
    });
  }

  async function getSession(forceRefresh = false) {
    if (!forceRefresh && sessionPromise) {
      return sessionPromise;
    }

    sessionPromise = request("/auth/me").catch(error => {
      sessionPromise = null;
      throw error;
    });
    return sessionPromise;
  }

  async function requireRole(expectedRole) {
    try {
      const currentSession = await getSession();
      if (expectedRole && currentSession.role !== expectedRole) {
        window.location.href = currentSession.dashboard;
        return null;
      }
      return currentSession;
    } catch (error) {
      window.location.href = "/login.html";
      return null;
    }
  }

  async function syncLegacyData() {
    if (legacySyncPromise) {
      return legacySyncPromise;
    }

    legacySyncPromise = (async () => {
      const legacyStudents = parseStoredArray("students");
      const legacyAttendance = parseStoredArray("attendanceData");

      if (legacyStudents.length === 0 && legacyAttendance.length === 0) {
        return { importedStudents: 0, importedAttendance: 0 };
      }

      let importedStudents = 0;
      let importedAttendance = 0;

      try {
        const currentSession = await getSession();
        if (currentSession.role !== "teacher") {
          return { importedStudents: 0, importedAttendance: 0 };
        }
      } catch (error) {
        return { importedStudents: 0, importedAttendance: 0 };
      }

      const [serverStudents, serverAttendance] = await Promise.all([
        listStudents(),
        listAttendance()
      ]);

      if (serverStudents.length === 0 && legacyStudents.length > 0) {
        const result = await importStudents(legacyStudents);
        importedStudents = Number(result.count || 0);
      }

      if (serverAttendance.length === 0 && legacyAttendance.length > 0) {
        const result = await importAttendance(legacyAttendance);
        importedAttendance = Number(result.count || 0);
      }

      return { importedStudents, importedAttendance };
    })().catch(error => {
      legacySyncPromise = null;
      throw error;
    });

    return legacySyncPromise;
  }

  async function login(credentials) {
    const currentSession = await request("/auth/login", {
      method: "POST",
      body: credentials
    });
    sessionPromise = Promise.resolve(currentSession);
    clearLegacySessionHints();
    return currentSession;
  }

  async function logout() {
    await request("/auth/logout", { method: "POST" });
    sessionPromise = null;
    clearLegacySessionHints();
  }

  function changePassword(payload) {
    return request("/auth/change-password", {
      method: "POST",
      body: payload
    });
  }

  function listStudents() {
    return request("/students");
  }

  function getCurrentStudent() {
    return request("/students/me");
  }

  function createStudent(student) {
    return request("/students", {
      method: "POST",
      body: student
    });
  }

  function updateStudent(originalRoll, student) {
    return request(`/students/${encodeURIComponent(originalRoll)}`, {
      method: "PUT",
      body: student
    });
  }

  function deleteStudent(roll) {
    return request(`/students/${encodeURIComponent(roll)}`, {
      method: "DELETE"
    });
  }

  function importStudents(students) {
    return request("/students/import", {
      method: "POST",
      body: { students }
    });
  }

  function listAttendance(filters = {}) {
    return request(`/attendance${buildQuery(filters)}`);
  }

  function saveAttendanceBatch(payload) {
    return request("/attendance/batch", {
      method: "POST",
      body: payload
    });
  }

  function importAttendance(records) {
    return request("/attendance/import", {
      method: "POST",
      body: { records }
    });
  }

  function getFaceRecognitionStatus() {
    return request("/face-recognition/status");
  }

  function verifyStudentFace() {
    return request("/face-recognition/student-verify", {
      method: "POST"
    });
  }

  function forgotPassword(username, email) {
    return request("/auth/forgot-password", {
      method: "POST",
      body: { username, email }
    });
  }

  window.AttendanceApi = {
    getBaseUrl,
    health: () => request("/health"),
    getSession,
    requireRole,
    login,
    logout,
    forgotPassword,
    changePassword,
    listStudents,
    getCurrentStudent,
    createStudent,
    updateStudent,
    deleteStudent,
    importStudents,
    listAttendance,
    saveAttendanceBatch,
    importAttendance,
    getFaceRecognitionStatus,
    verifyStudentFace,
    punchIn: (image) => request("/students/punch", { method: "POST", body: { image } }),
    listPunches: (params = {}) => request(`/attendance/punches${buildQuery(params)}`),
    listAssignments: (params = {}) => request(`/assignments${buildQuery(params)}`),
    createAssignment: (body) => request("/assignments", { method: "POST", body }),
    submitAssignment: (body) => request("/submissions", { method: "POST", body }),
    listSubmissions: (params = {}) => request(`/submissions${buildQuery(params)}`),
    gradeSubmission: (id, body) => request(`/submissions/${id}`, { method: "PATCH", body }),
    deleteAssignment: (id) => request(`/assignments/${id}`, { method: "DELETE" }),
    request,
    syncLegacyData,
    clearLegacySessionHints
  };
})();
