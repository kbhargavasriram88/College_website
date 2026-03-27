document.addEventListener("DOMContentLoaded", async () => {
  const currentSession = await AttendanceApi.requireRole("teacher");
  if (!currentSession) {
    return;
  }

  const classSelect = document.getElementById("classSelect");
  const subjectSelect = document.getElementById("subjectSelect");
  const attendanceDate = document.getElementById("attendanceDate");
  const tableBody = document.querySelector("#studentTable tbody");
  const markAllPresent = document.getElementById("markAllPresent");
  const markAllAbsent = document.getElementById("markAllAbsent");
  const saveBtn = document.getElementById("saveBtn");
  const presentCount = document.getElementById("presentCount");
  const absentCount = document.getElementById("absentCount");
  const percentage = document.getElementById("percentage");

  let students = [];
  let attendanceData = [];
  let dailyPunches = {};
  const draftStatuses = new Map();

  try {
    await AttendanceApi.syncLegacyData();
    await refreshData();
    await syncPunches();
  } catch (error) {
    tableBody.innerHTML = `
      <tr class="empty-state">
        <td colspan="4">${error.message}</td>
      </tr>
    `;
    return;
  }

  setDefaultDate();
  syncClassOptions();
  renderTable();

  classSelect.addEventListener("change", renderTable);
  subjectSelect.addEventListener("change", renderTable);
  attendanceDate.addEventListener("change", async () => {
    await syncPunches();
    renderTable();
  });

  async function syncPunches() {
    const date = attendanceDate.value || new Date().toISOString().split("T")[0];
    try {
      const data = await AttendanceApi.listPunches({ date });
      dailyPunches = data.punches || {};
    } catch (e) {
      console.error("Punch sync failed:", e);
      dailyPunches = {};
    }
  }

  markAllPresent.addEventListener("click", () => {
    applyStatusToVisibleRows("P");
  });

  markAllAbsent.addEventListener("click", () => {
    applyStatusToVisibleRows("A");
  });

  tableBody.addEventListener("click", event => {
    const button = event.target.closest(".status-btn");
    if (!button || button.disabled) {
      return;
    }

    const nextStatus = button.classList.contains("present") ? "A" : "P";
    setDraftStatus(button.dataset.roll, nextStatus);
    paintStatusButton(button, nextStatus);
    updateSummary();
  });

  saveBtn.addEventListener("click", async () => {
    const context = getContext();
    const visibleStudents = getVisibleStudents();

    if (!context.date) {
      alert("Please select an attendance date.");
      attendanceDate.focus();
      return;
    }

    if (visibleStudents.length === 0) {
      alert("No students are available for the selected class.");
      return;
    }

    try {
      await AttendanceApi.saveAttendanceBatch({
        date: context.date,
        subject: context.subject,
        className: context.className,
        records: visibleStudents.map(student => ({
          roll: student.roll,
          name: student.name,
          status: getStatusForStudent(student.roll)
        }))
      });

      await refreshData();
      await syncPunches();
      alert("Attendance saved successfully.");
      renderTable();
    } catch (error) {
      alert(error.message);
    }
  });

  async function refreshData() {
    students = (await AttendanceApi.listStudents())
      .map(student => ({
        ...student,
        roll: String(student.roll ?? "").trim(),
        name: normalizeText(student.name),
        class: normalizeText(student.class)
      }))
      .filter(student => student.roll && student.name)
      .sort((left, right) =>
        left.roll.localeCompare(right.roll, undefined, { numeric: true, sensitivity: "base" })
      );

    attendanceData = await AttendanceApi.listAttendance();
    syncClassOptions();
  }

  function syncClassOptions() {
    const existingKeys = new Set(
      Array.from(classSelect.options).map(option => normalizeKey(option.value))
    );

    students.forEach(student => {
      if (!student.class) {
        return;
      }

      const classKey = normalizeKey(student.class);
      if (existingKeys.has(classKey)) {
        return;
      }

      const option = document.createElement("option");
      option.value = student.class;
      option.textContent = student.class;
      classSelect.appendChild(option);
      existingKeys.add(classKey);
    });
  }

  function setDefaultDate() {
    if (attendanceDate.value) {
      return;
    }

    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    attendanceDate.value = `${year}-${month}-${day}`;
  }

  function getContext() {
    return {
      className: normalizeText(classSelect.value),
      classKey: normalizeKey(classSelect.value),
      subject: normalizeText(subjectSelect.value),
      subjectKey: normalizeKey(subjectSelect.value),
      date: attendanceDate.value
    };
  }

  function hasStoredClassData() {
    return students.some(student => student.class);
  }

  function getVisibleStudents() {
    const context = getContext();

    if (!hasStoredClassData()) {
      return students;
    }

    return students.filter(student => normalizeKey(student.class) === context.classKey);
  }

  function renderTable() {
    const context = getContext();
    const visibleStudents = getVisibleStudents();

    tableBody.innerHTML = "";

    if (students.length === 0) {
      tableBody.innerHTML = `
        <tr class="empty-state">
          <td colspan="4">No students found. Add students first in Manage Students.</td>
        </tr>
      `;
      updateSummary();
      return;
    }

    if (visibleStudents.length === 0) {
      tableBody.innerHTML = `
        <tr class="empty-state">
          <td colspan="4">No students match ${context.className}. Add or update student class details.</td>
        </tr>
      `;
      updateSummary();
      return;
    }

    visibleStudents.forEach(student => {
      const row = document.createElement("tr");
      const hasPunched = !!(dailyPunches && dailyPunches[student.roll]);
      const status = hasPunched ? getStatusForStudent(student.roll) : "A";
      const displayClass = student.class || context.className;

      row.innerHTML = `
        <td>${student.roll}</td>
        <td>${student.name}</td>
        <td>${displayClass}</td>
        <td>
          <button
            type="button"
            class="status-btn ${status === "A" ? "absent" : "present"}"
            data-roll="${student.roll}"
            ${!hasPunched ? 'disabled style="opacity: 0.6; cursor: not-allowed;" title="Identity not verified today"' : ""}
          >
            ${!hasPunched ? '<span style="font-size: 14px;">🔒</span> Locked' : (status === "A" ? "Absent" : "Present")}
          </button>
        </td>
      `;

      tableBody.appendChild(row);
    });

    updateSummary();
  }

  function updateSummary() {
    const buttons = tableBody.querySelectorAll(".status-btn");
    let present = 0;
    let absent = 0;

    buttons.forEach(button => {
      if (button.classList.contains("present")) {
        present++;
      } else if (button.classList.contains("absent")) {
        absent++;
      }
    });

    presentCount.textContent = present;
    absentCount.textContent = absent;

    const total = present + absent;
    percentage.textContent = total === 0
      ? "0%"
      : `${Math.round((present / total) * 100)}%`;
  }

  function applyStatusToVisibleRows(status) {
    const buttons = tableBody.querySelectorAll(".status-btn");

    buttons.forEach(button => {
      setDraftStatus(button.dataset.roll, status);
      paintStatusButton(button, status);
    });

    updateSummary();
  }

  function paintStatusButton(button, status) {
    const isPresent = status === "P";

    button.classList.toggle("present", isPresent);
    button.classList.toggle("absent", !isPresent);
    button.textContent = isPresent ? "Present" : "Absent";
  }

  function getStatusForStudent(roll) {
    const key = makeDraftKey(roll);

    if (draftStatuses.has(key)) {
      return draftStatuses.get(key);
    }

    const context = getContext();
    const existingRecord = attendanceData.find(record =>
      isSameContext(record, context) && String(record.roll) === roll
    );

    const status = existingRecord?.status === "A" ? "A" : "P";
    draftStatuses.set(key, status);
    return status;
  }

  function setDraftStatus(roll, status) {
    draftStatuses.set(makeDraftKey(roll), status === "A" ? "A" : "P");
  }

  function makeDraftKey(roll) {
    const context = getContext();
    return [
      context.date,
      context.subjectKey,
      context.classKey,
      String(roll)
    ].join("|");
  }

  function isSameContext(record, context) {
    return record.date === context.date &&
      normalizeKey(record.subject) === context.subjectKey &&
      normalizeKey(record.class) === context.classKey;
  }

  function normalizeText(value) {
    return String(value ?? "").trim();
  }

  function normalizeKey(value) {
    return normalizeText(value).toLowerCase();
  }
});
