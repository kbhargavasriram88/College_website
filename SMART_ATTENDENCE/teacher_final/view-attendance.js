document.addEventListener("DOMContentLoaded", async () => {
  const currentSession = await AttendanceApi.requireRole("teacher");
  if (!currentSession) {
    return;
  }

  const tbody = document.querySelector("#attendanceTable tbody");
  const summaryBody = document.querySelector("#summaryTable tbody");
  const subjectFilter = document.getElementById("subjectFilter");
  const startDate = document.getElementById("startDate");
  const endDate = document.getElementById("endDate");
  const searchInput = document.getElementById("searchInput");
  const exportCSV = document.getElementById("exportCSV");
  const exportPDF = document.getElementById("exportPDF");

  let attendanceData = [];
  let currentRecords = [];

  try {
    await AttendanceApi.syncLegacyData();
    attendanceData = await AttendanceApi.listAttendance();
  } catch (error) {
    tbody.innerHTML = `<tr><td colspan="6">${error.message}</td></tr>`;
    summaryBody.innerHTML = `<tr><td colspan="5">Backend connection is required.</td></tr>`;
    return;
  }

  populateSubjectFilter();
  applyFilters();

  subjectFilter.addEventListener("change", applyFilters);
  startDate.addEventListener("change", applyFilters);
  endDate.addEventListener("change", applyFilters);
  searchInput.addEventListener("input", applyFilters);

  exportCSV.addEventListener("click", () => {
    if (currentRecords.length === 0) {
      alert("No data to export");
      return;
    }

    let csv = "Date,Subject,Class,Roll,Name,Status\n";
    currentRecords.forEach(record => {
      csv += `${record.date},${record.subject},${record.class},${record.roll},${record.name},${record.status}\n`;
    });

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "attendance-report.csv";
    link.click();
    URL.revokeObjectURL(url);
  });

  exportPDF.addEventListener("click", () => {
    if (currentRecords.length === 0) {
      alert("No data to export");
      return;
    }

    if (!window.jspdf) {
      alert("PDF export needs the PDF library to load first.");
      return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const tableData = currentRecords.map(record => [
      record.date,
      record.subject,
      record.class,
      record.roll,
      record.name,
      record.status === "P" ? "Present" : "Absent"
    ]);

    doc.text("Attendance Report", 14, 15);
    doc.autoTable({
      head: [["Date", "Subject", "Class", "Roll", "Name", "Status"]],
      body: tableData,
      startY: 20
    });
    doc.save("attendance-report.pdf");
  });

  function populateSubjectFilter() {
    const subjects = [...new Set(attendanceData.map(record => record.subject).filter(Boolean))];
    subjects.forEach(subject => {
      const option = document.createElement("option");
      option.value = subject;
      option.textContent = subject;
      subjectFilter.appendChild(option);
    });
  }

  function applyFilters() {
    const searchValue = searchInput.value.trim().toLowerCase();

    currentRecords = attendanceData.filter(record => {
      const matchSubject = subjectFilter.value === "all" || record.subject === subjectFilter.value;
      const matchStart = !startDate.value || record.date >= startDate.value;
      const matchEnd = !endDate.value || record.date <= endDate.value;
      const haystack = [record.name, record.roll, record.class, record.subject, record.date]
        .join(" ")
        .toLowerCase();
      const matchSearch = !searchValue || haystack.includes(searchValue);

      return matchSubject && matchStart && matchEnd && matchSearch;
    });

    renderTable(currentRecords);
    generateSummary(currentRecords);
  }

  function renderTable(records) {
    tbody.innerHTML = "";

    if (records.length === 0) {
      tbody.innerHTML = "<tr><td colspan='6'>No Records Found</td></tr>";
      return;
    }

    records.forEach(record => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${record.date}</td>
        <td>${record.subject}</td>
        <td>${record.class}</td>
        <td>${record.roll}</td>
        <td>${record.name}</td>
        <td class="${record.status === "P" ? "status-present" : "status-absent"}">
          ${record.status === "P" ? "Present" : "Absent"}
        </td>
      `;
      tbody.appendChild(row);
    });
  }

  function generateSummary(records) {
    summaryBody.innerHTML = "";

    const studentMap = {};
    records.forEach(record => {
      if (!studentMap[record.roll]) {
        studentMap[record.roll] = {
          name: record.name,
          total: 0,
          present: 0
        };
      }

      studentMap[record.roll].total++;
      if (record.status === "P") {
        studentMap[record.roll].present++;
      }
    });

    const rolls = Object.keys(studentMap);
    if (rolls.length === 0) {
      summaryBody.innerHTML = "<tr><td colspan='5'>No summary data available.</td></tr>";
      return;
    }

    rolls.forEach(roll => {
      const student = studentMap[roll];
      const percent = Math.round((student.present / student.total) * 100);
      const row = document.createElement("tr");
      const lowClass = percent < 75 ? "low-attendance" : "";

      row.innerHTML = `
        <td>${roll}</td>
        <td>${student.name}</td>
        <td>${student.total}</td>
        <td>${student.present}</td>
        <td>
          <div class="progress-bar ${lowClass}">
            <div class="progress-fill" style="width:${percent}%"></div>
          </div>
          ${percent}%
        </td>
      `;
      summaryBody.appendChild(row);
    });
  }
});
