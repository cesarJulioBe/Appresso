const crypto = require('crypto');
const validateTransactionHash = require('./src/domain/fraud/validateTransactionHash');

const secret = 'mi_llave_privada_appresso_2026';

const transaction = {
  idTxn: 10001,
  user: 'aa@aa.com',
  date: '2026-09-23T10:30:01.120',
  value: 50000,
  paymentMethod: 'Tarjeta',
};

// Generamos el hash correcto (simulando lo que haría el cliente real)
const payload = JSON.stringify(transaction, Object.keys(transaction).sort());
const correctHash = crypto.createHmac('sha256', secret).update(payload).digest('hex');

console.log('Hash generado:', correctHash);

// Caso 1: hash correcto
console.log('¿Válido con hash correcto?', validateTransactionHash({ ...transaction, hash: correctHash }, secret));

// Caso 2: alguien alteró el valor después de calcular el hash
console.log('¿Válido con valor alterado?', validateTransactionHash({ ...transaction, value: 999999, hash: correctHash }, secret));

const getThresholdByTime = require('./src/domain/fraud/getThresholdByTime');

const thresholds = [
  { franja: 'mañana', hora_inicio: '05:00:01', hora_fin: '12:00:00', umbral_transacciones: 10, ventana_segundos: 3 },
  { franja: 'tarde-noche', hora_inicio: '12:00:01', hora_fin: '20:00:00', umbral_transacciones: 6, ventana_segundos: 3 },
  { franja: 'noche-madrugada', hora_inicio: '20:00:01', hora_fin: '05:00:00', umbral_transacciones: 3, ventana_segundos: 3 },
];

console.log('8:00 AM:', getThresholdByTime(new Date('2026-09-23T08:00:00'), thresholds));
console.log('3:00 PM:', getThresholdByTime(new Date('2026-09-23T15:00:00'), thresholds));
console.log('11:00 PM:', getThresholdByTime(new Date('2026-09-23T23:00:00'), thresholds));
console.log('2:00 AM:', getThresholdByTime(new Date('2026-09-23T02:00:00'), thresholds));