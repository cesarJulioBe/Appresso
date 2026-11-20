const OrderQueue = require('../../domain/delivery/OrderQueue');
const { ORDER_STATUS } = require('../../domain/constants/orderStatus');
const { NotFoundError } = require('../../domain/errors');

class QueueService {
  constructor({ orderRepository, actionStack, logger }) {
    this.orderRepository = orderRepository;
    this.actionStack = actionStack;
    this.logger = logger;
  }

  async #buildPendingQueue() {
    const pending = await this.orderRepository.findByStatus(ORDER_STATUS.REQUESTED);
    const queue = new OrderQueue();
    pending.forEach((order) => queue.enqueue(order));
    return queue;
  }

  async getPending() {
    const queue = await this.#buildPendingQueue();
    return {
      totalPending: queue.size(),
      next: queue.peek(),
    };
  }

  async attendNext() {
    const queue = await this.#buildPendingQueue();
    const nextOrder = queue.dequeue();

    if (!nextOrder) {
      throw new NotFoundError('No hay pedidos pendientes');
    }

    const previousStatus = nextOrder.status;
    const updated = await this.orderRepository.updateStatus(
      nextOrder.id,
      ORDER_STATUS.IN_PROGRESS
    );

    this.actionStack.push({
      orderId: nextOrder.id,
      previousStatus,
      newStatus: ORDER_STATUS.IN_PROGRESS,
    });

    this.logger?.info('Siguiente pedido de la cola atendido', {
      orderId: nextOrder.id,
      previousStatus,
      newStatus: ORDER_STATUS.IN_PROGRESS,
    });

    return updated;
  }
}

module.exports = QueueService;
