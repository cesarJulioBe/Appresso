function receivedType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function validateTransaction(transaction) {
  const errors = [];
  const { idTxn, user, date, value, paymentMethod, hash } = transaction;

  if (!Number.isSafeInteger(idTxn) || idTxn <= 0) {
    errors.push({
      field: 'idTxn',
      reason: 'Debe ser un entero positivo',
      receivedType: receivedType(idTxn),
    });
  }

  if (
    typeof user !== 'string'
    || user.trim() !== user
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user)
  ) {
    errors.push({
      field: 'user',
      reason: 'Debe ser un correo electrónico válido',
      receivedType: receivedType(user),
    });
  }

  const parsedDate = typeof date === 'string' ? new Date(date) : null;
  if (
    typeof date !== 'string'
    || date.trim() !== date
    || !date.includes('T')
    || !parsedDate
    || Number.isNaN(parsedDate.getTime())
  ) {
    errors.push({
      field: 'date',
      reason: 'Debe ser una fecha ISO 8601 válida',
      receivedType: receivedType(date),
    });
  }

  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    errors.push({
      field: 'value',
      reason: 'Debe ser un número finito mayor que cero',
      receivedType: receivedType(value),
    });
  }

  const validPaymentMethod = (
    (typeof paymentMethod === 'string' && paymentMethod.trim().length > 0)
    || (typeof paymentMethod === 'number' && Number.isFinite(paymentMethod))
  );
  if (!validPaymentMethod) {
    errors.push({
      field: 'paymentMethod',
      reason: 'Debe ser un texto no vacío o un número',
      receivedType: receivedType(paymentMethod),
    });
  }

  if (typeof hash !== 'string' || !/^[a-f0-9]{64}$/i.test(hash)) {
    errors.push({
      field: 'hash',
      reason: 'Debe ser un HMAC-SHA256 hexadecimal de 64 caracteres',
      receivedType: receivedType(hash),
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

module.exports = validateTransaction;
