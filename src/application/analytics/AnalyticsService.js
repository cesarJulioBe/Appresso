const calculateStatistics = require('../../domain/algorithms/calculateStatistics');
const { findPositionForValue } = require('../../domain/algorithms/arithmeticProgression');
const linearRegression = require('../../domain/algorithms/linearRegression');
const { ValidationError } = require('../../domain/errors');

class AnalyticsService {
  constructor({ orderRepository, logger }) {
    this.orderRepository = orderRepository;
    this.logger = logger;
  }

  async getStatistics() {
    const orders = await this.orderRepository.findAllUnpaginated();
    return calculateStatistics(orders);
  }

  getLoyaltyProgression({ firstTerm = 2, commonDifference = 2 } = {}) {
    const parsedFirst = parseFloat(firstTerm) || 2;
    const parsedDiff = parseFloat(commonDifference) || 2;
    const targets = [42, 72, 120];

    const results = targets.map((target) => ({
      target,
      week: findPositionForValue(parsedFirst, parsedDiff, target),
    }));

    return {
      firstTerm: parsedFirst,
      commonDifference: parsedDiff,
      results,
    };
  }

  predictSales(salesHistory) {
    if (!Array.isArray(salesHistory) || salesHistory.length < 2) {
      throw new ValidationError('salesHistory debe ser un arreglo con al menos 2 valores');
    }

    const model = linearRegression(salesHistory);
    const days = [2, 5, 7];
    const predictions = days.map((d) => ({ days: d, predictedSales: model.predict(d) }));

    return {
      slope: model.slope,
      intercept: model.intercept,
      predictions,
    };
  }
}

module.exports = AnalyticsService;
