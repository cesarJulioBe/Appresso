class QueueController {
  constructor({ queueService }) {
    this.queueService = queueService;
  }

  getPending = async (_req, res) => {
    const result = await this.queueService.getPending();
    res.json(result);
  };

  attendNext = async (_req, res) => {
    const updated = await this.queueService.attendNext();
    res.json(updated);
  };
}

module.exports = QueueController;
