/** shift: { start:'HH:MM', grace_min } ; local: Date interpreted with tzOffsetMin */
export function minutesOfDay(date, tzOffsetMin = 0) {
  const t = new Date(date.getTime() + tzOffsetMin * 60000);
  return t.getUTCHours() * 60 + t.getUTCMinutes();
}

export function attendanceStatus(shift, checkInDate, tzOffsetMin = 0) {
  if (!checkInDate) return 'absent';
  const [h, m] = shift.start.split(':').map(Number);
  const startMin = h * 60 + m;
  const arrived = minutesOfDay(checkInDate, tzOffsetMin);
  return arrived <= startMin + shift.grace_min ? 'present' : 'late';
}
