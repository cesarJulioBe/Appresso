const linearSearch = require('../../domain/algorithms/linearSearch');
const binarySearch = require('../../domain/algorithms/binarySearch');
const { VALID_ORDER_STATUSES } = require('../../domain/constants/orderStatus');
const { ValidationError, NotFoundError } = require('../../domain/errors');

class OrderService {
  constructor({ orderRepository, actionStack, logger }) {
    this.orderRepository = orderRepository;
    this.actionStack = actionStack;
    this.logger = logger;
  }

  async create(customer, products) {
    if (!customer || !products) {
      throw new ValidationError('customer y products son obligatorios');
    }

    const order = await this.orderRepository.create(customer, products);
    this.logger?.info('Pedido creado', { orderId: order.id, customer });
    return order;
  }

  async list(page = 1, pageSize = 20) {
    const parsedPage = parseInt(page, 10) || 1;
    const parsedPageSize = parseInt(pageSize, 10) || 20;
    return this.orderRepository.findAll(parsedPage, parsedPageSize);
  }

  async getById(id) {
    const order = await this.orderRepository.findById(id);
    if (!order) {
      throw new NotFoundError('Pedido no encontrado');
    }
    return order;
  }

  async searchComparingAlgorithms(id) {
    const allOrders = await this.orderRepository.findAllUnpaginated();
    const targetId = parseInt(id, 10);

    const linearResult = linearSearch(allOrders, targetId);
    const binaryResult = binarySearch(allOrders, targetId);

    const foundOrder = linearResult.order || binaryResult.found || null;

    return {
      order: foundOrder,
      linear: { found: !!linearResult.order, operations: linearResult.operationsCount },
      binary: { found: !!binaryResult.found, operations: binaryResult.operationsCount },
    };
  }

  async updateStatus(id, status) {
    if (!VALID_ORDER_STATUSES.includes(status)) {
      throw new ValidationError('Estado inválido');
    }

    const currentOrder = await this.orderRepository.findById(id);
    if (!currentOrder) {
      throw new NotFoundError('Pedido no encontrado');
    }
    const previousStatus = currentOrder.status;

    const updated = await this.orderRepository.updateStatus(id, status);
    if (!updated) {
      throw new NotFoundError('Pedido no encontrado');
    }

    this.actionStack.push({
      orderId: currentOrder.id,
      previousStatus,
      newStatus: status,
    });

    this.logger?.info('Estado de pedido actualizado', {
      orderId: updated.id,
      previousStatus,
      newStatus: status,
    });

    return updated;
  }

  async undoLastChange() {
    const lastAction = this.actionStack.pop();
    if (!lastAction) {
      throw new NotFoundError('No hay acciones para deshacer');
    }

    const restored = await this.orderRepository.updateStatus(
      lastAction.orderId,
      lastAction.previousStatus
    );

    this.logger?.info('Cambio de estado de pedido deshecho', {
      orderId: lastAction.orderId,
      restoredStatus: lastAction.previousStatus,
    });

    return { undone: lastAction, order: restored };
  }
}

module.exports = OrderService;
