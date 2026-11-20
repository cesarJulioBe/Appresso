const ORDER_STATUS = Object.freeze({
  REQUESTED: 'Requested',
  IN_PROGRESS: 'In Progress',
  DELIVERED: 'Delivered',
});

const VALID_ORDER_STATUSES = Object.freeze(Object.values(ORDER_STATUS));

module.exports = {
  ORDER_STATUS,
  VALID_ORDER_STATUSES,
};
