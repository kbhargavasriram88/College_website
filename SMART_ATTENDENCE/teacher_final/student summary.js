document.addEventListener("DOMContentLoaded", async () => {
  const currentSession = await AttendanceApi.requireRole("teacher");
  if (!currentSession) {
    return;
  }

  const tbody = document.querySelector("#summaryTable tbody");

  let attendanceData = [];
  try {
    await AttendanceApi.syncLegacyData();
    attendanceData = await AttendanceApi.listAttendance();
  } catch (error) {
    tbody.innerHTML = `<tr><td colspan="5">${error.message}</td></tr>`;
    return;
  }

  if (attendanceData.length === 0) {
    tbody.innerHTML = "<tr><td colspan='5'>No attendance records found.</td></tr>";
    return;
  }

  const studentMap = {};
  attendanceData.forEach(record => {
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

  Object.keys(studentMap).forEach(roll => {
    const student = studentMap[roll];
    const percent = Math.round((student.present / student.total) * 100);
    const row = document.createElement("tr");

    row.innerHTML = `
      <td>${roll}</td>
      <td>${student.name}</td>
      <td>${student.total}</td>
      <td>${student.present}</td>
      <td>${percent}%</td>
    `;

    tbody.appendChild(row);
  });
});
