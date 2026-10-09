const crypto = require('crypto');

function validateTransactionHash(transaction, secret) {
  const { idTxn, user, date, value, paymentMethod } = transaction;
  const dataToHash = { idTxn, user, date, value, paymentMethod };
  const payload = JSON.stringify(dataToHash);

  const expectedHash = crypto
    .createHmac('sha256', secret)
    .update(payload, 'utf8')
    .digest('hex');

  return expectedHash === transaction.hash;
}

module.exports = validateTransactionHash;