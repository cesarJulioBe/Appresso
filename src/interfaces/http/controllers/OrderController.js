class OrderController {
  constructor({ orderService }) {
    this.orderService = orderService;
  }

  create = async (req, res) => {
    const { customer, products } = req.body;
    const order = await this.orderService.create(customer, products);
    res.status(201).json(order);
  };

  list = async (req, res) => {
    const page = parseInt(req.query.page, 10) || 1;
    const pageSize = parseInt(req.query.pageSize, 10) || 20;
    const result = await this.orderService.list(page, pageSize);
    res.json(result);
  };

  getById = async (req, res) => {
    const order = await this.orderService.getById(req.params.id);
    res.json(order);
  };

  searchComparingAlgorithms = async (req, res) => {
    const result = await this.orderService.searchComparingAlgorithms(req.params.id);
    res.json(result);
  };

  updateStatus = async (req, res) => {
    const order = await this.orderService.updateStatus(req.params.id, req.body.status);
    res.json(order);
  };

  undo = async (_req, res) => {
    const result = await this.orderService.undoLastChange();
    res.json(result);
  };
}

module.exports = OrderController;
