function timeToMinutes(timeStr) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

function isWithinRange(currentMinutes, startMinutes, endMinutes) {
  if (startMinutes <= endMinutes) {
    // Rango normal, ej: 05:00 a 12:00
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  }
  // Rango que cruza la medianoche, ej: 20:00 a 05:00 (del día siguiente)
  return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
}

function getThresholdByTime(date, thresholds) {
  const timeZone = process.env.APP_TIMEZONE || 'America/Bogota';
  const timeParts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const currentMinutes = Number(timeParts.find(part => part.type === 'hour').value) * 60
    + Number(timeParts.find(part => part.type === 'minute').value);

  for (const row of thresholds) {
    const startMinutes = timeToMinutes(row.hora_inicio);
    const endMinutes = timeToMinutes(row.hora_fin);

    if (isWithinRange(currentMinutes, startMinutes, endMinutes)) {
      return {
        franja: row.franja,
        umbral: row.umbral_transacciones,
        ventanaSegundos: row.ventana_segundos,
      };
    }
  }

  return null;
}

module.exports = getThresholdByTime;