class AnalyticsController {
  constructor({ analyticsService }) {
    this.analyticsService = analyticsService;
  }

  getStatistics = async (_req, res) => {
    const stats = await this.analyticsService.getStatistics();
    res.json(stats);
  };

  getLoyaltyProgression = (req, res) => {
    const result = this.analyticsService.getLoyaltyProgression({
      firstTerm: req.query.firstTerm,
      commonDifference: req.query.commonDifference,
    });
    res.json(result);
  };

  predictSales = (req, res) => {
    const result = this.analyticsService.predictSales(req.body.salesHistory);
    res.json(result);
  };
}

module.exports = AnalyticsController;
