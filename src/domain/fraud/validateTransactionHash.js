const crypto = require('crypto');

function validateTransactionHash(transaction, secret) {
const { idTxn, user, date, value, paymentMethod } = transaction;

const payload = JSON.stringify(
    { idTxn, user, date, value, paymentMethod },
    Object.keys({ idTxn, user, date, value, paymentMethod }).sort()
);

const expectedHash = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

return expectedHash === transaction.hash;
}

module.exports = validateTransactionHash;