document.addEventListener("DOMContentLoaded", async () => {
  const currentSession = await AttendanceApi.requireRole("student");
  if (!currentSession) return;

  // Selectors
  const tableBody = document.getElementById("attendanceTableBody");
  const headerRow = document.querySelector("#attendanceTable thead tr");
  const welcomeName = document.getElementById("welcomeName");
  const studentMetaPill = document.getElementById("studentMetaPill");
  const searchInput = document.getElementById("subjectSearch");

  // Stat Elements
  const totalClassesEl = document.getElementById("totalClassesCount");
  const presentDaysEl = document.getElementById("presentDaysCount");
  const absentDaysEl = document.getElementById("absentDaysCount");
  const attendancePercentEl = document.getElementById("attendancePercentage");

  let student = null;
  let attendanceData = [];

  try {
    [student, attendanceData] = await Promise.all([
      AttendanceApi.getCurrentStudent(),
      AttendanceApi.listAttendance()
    ]);
    
    welcomeName.textContent = student?.name || currentSession.name || "Student";
    updateStudentMeta(student, attendanceData);
    
    if (attendanceData.length === 0) {
      renderEmptyState("No attendance records found yet.");
    } else {
      processAndRender(attendanceData);
    }
  } catch (error) {
    console.error("Initialization failed:", error);
    renderEmptyState("Attendance data is currently unavailable.");
  }

  // Search Functionality
  searchInput.addEventListener("input", () => {
    const query = searchInput.value.toLowerCase();
    const filtered = attendanceData.filter(r => r.subject.toLowerCase().includes(query));
    processAndRender(filtered, true); // true = skip stats update to maintain overall totals
  });

  function processAndRender(records, isSearch = false) {
    const groupedByDate = groupRecordsByDate(records);
    const slotCount = Math.max(5, ...groupedByDate.map(([, dateRecords]) => dateRecords.length));
    
    // Only update stats if we're not just searching/filtering the view
    if (!isSearch) {
      updateStats(attendanceData);
    }

    renderTable(groupedByDate, slotCount);
  }

  function updateStats(records) {
    const total = records.length;
    const present = records.filter(r => r.status === "P").length;
    const absent = total - present;
    const percent = total > 0 ? Math.round((present / total) * 100) : 0;

    totalClassesEl.textContent = total;
    presentDaysEl.textContent = present;
    absentDaysEl.textContent = absent;
    attendancePercentEl.textContent = `${percent}%`;
    
    // Aesthetic: Color the percentage based on health
    attendancePercentEl.style.color = percent >= 75 ? "var(--success)" : "var(--danger)";
  }

  function renderTable(grouped, slotCount) {
    buildHeader(slotCount);
    tableBody.innerHTML = "";

    if (grouped.length === 0) {
      renderEmptyState("No sessions match your search.");
      return;
    }

    grouped.forEach(([date, dateRecords]) => {
      const row = document.createElement("tr");
      
      // Date & Day Cells
      addCell(row, date);
      addCell(row, formatDay(date));

      // Subject Slots
      dateRecords.forEach(record => {
        const cell = document.createElement("td");
        cell.className = "subject-cell";
        
        const name = document.createElement("div");
        name.className = "subject-name";
        name.textContent = record.subject;
        
        const pill = document.createElement("span");
        pill.className = `status-pill ${record.status === "A" ? "is-absent" : "is-present"}`;
        pill.textContent = record.status === "P" ? "Present" : "Absent";
        
        cell.appendChild(name);
        cell.appendChild(pill);
        row.appendChild(cell);
      });

      // Fill remaining empty slots
      for (let i = dateRecords.length; i < slotCount; i++) {
        addCell(row, "-");
      }

      tableBody.appendChild(row);
    });
  }

  function buildHeader(slotCount) {
    headerRow.innerHTML = "<th>Date</th><th>Day</th>";
    for (let i = 0; i < slotCount; i++) {
      const th = document.createElement("th");
      th.textContent = `Session ${i + 1}`;
      headerRow.appendChild(th);
    }
  }

  function renderEmptyState(message) {
    tableBody.innerHTML = `<tr><td colspan="7" class="empty-state">${message}</td></tr>`;
  }

  function groupRecordsByDate(records) {
    const grouped = new Map();
    records.sort((a,b) => new Date(a.date) - new Date(b.date)).forEach(r => {
      if (!grouped.has(r.date)) grouped.set(r.date, []);
      grouped.get(r.date).push(r);
    });
    return Array.from(grouped.entries());
  }

  function updateStudentMeta(student, records) {
    const meta = student ? 
      `${student.course} | Semester ${student.semester} | ${student.class}` : 
      "Attendance Registry";
    studentMetaPill.textContent = meta;
  }

  function addCell(row, text) {
    const td = document.createElement("td");
    td.textContent = text;
    row.appendChild(td);
  }

  function formatDay(dateStr) {
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? "N/A" : d.toLocaleDateString(undefined, { weekday: 'short' });
  }
});

