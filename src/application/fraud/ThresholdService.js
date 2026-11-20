const getThresholdByTime = require('../../domain/fraud/getThresholdByTime');
const { ValidationError, NotFoundError } = require('../../domain/errors');

class ThresholdService {
  constructor({ thresholdRepository, logger }) {
    this.thresholdRepository = thresholdRepository;
    this.logger = logger;
    // Estado en memoria: fuente de verdad inmediata para validar sin consultar la BD en cada transacción
    this.memoryThresholds = getThresholdByTime.DEFAULT_THRESHOLDS.map((t) => ({ ...t }));
    this.initializedFromDb = false;
  }

  getThresholdsInMemory() {
    return this.memoryThresholds;
  }

  async list() {
    if (!this.initializedFromDb && this.thresholdRepository) {
      try {
        const rows = await this.thresholdRepository.findAll();
        if (Array.isArray(rows) && rows.length > 0) {
          this.memoryThresholds = rows.map((r) => ({ ...r }));
        }
        this.initializedFromDb = true;
      } catch (err) {
        this.logger?.warn('Usando umbrales en memoria (no se pudo sincronizar desde BD)', {
          error: err.message,
        });
      }
    }
    return this.memoryThresholds;
  }

  async update(franja, { umbralTransacciones, ventanaSegundos } = {}) {
    const parsedUmbral = Number(umbralTransacciones);
    const parsedVentana = Number(ventanaSegundos);

    if (!parsedUmbral || parsedUmbral <= 0 || !parsedVentana || parsedVentana <= 0) {
      throw new ValidationError('umbralTransacciones y ventanaSegundos son obligatorios');
    }

    const idx = this.memoryThresholds.findIndex((t) => t.franja === franja);

    let updated = null;
    if (this.thresholdRepository) {
      updated = await this.thresholdRepository.updateThreshold(
        franja,
        parsedUmbral,
        parsedVentana
      );
    }

    if (!updated && idx === -1) {
      throw new NotFoundError('Franja no encontrada');
    }

    if (idx !== -1) {
      this.memoryThresholds[idx] = {
        ...this.memoryThresholds[idx],
        ...(updated || {}),
        umbral_transacciones: parsedUmbral,
        ventana_segundos: parsedVentana,
      };
      if (!updated) {
        updated = this.memoryThresholds[idx];
      }
    }

    this.logger?.info('Umbral y ventana actualizados en memoria y BD', {
      franja,
      umbralTransacciones: parsedUmbral,
      ventanaSegundos: parsedVentana,
    });

    return updated;
  }
}

module.exports = ThresholdService;
