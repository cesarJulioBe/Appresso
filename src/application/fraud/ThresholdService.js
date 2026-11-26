/**
 * @file ThresholdService.js
 * @description Caso de uso de administración dinámica de umbrales horarios antifraude
 * (`umbral_transacciones` y `ventana_segundos` por franja del día), manteniendo una caché viva
 * en memoria sincronizada con PostgreSQL para permitir validaciones en $O(1)$ sin latencia SQL
 * en cada transacción entrante.
 *
 * - **Capa arquitectónica:** Aplicación - Casos de Uso (`src/application/fraud`).
 * - **Inyección de Dependencias (`container.js`):** Recibe desde `buildContainer()` en `src/container.js`:
 *   - `thresholdRepository`: Instancia de `ThresholdRepository` conectada a `configuracion_umbrales`.
 *   - `logger`: Logger contextualizado con `childLogger('ThresholdService')`.
 *   *(Además es inyectado dentro de `TransactionService` en `container.js` para lecturas instantáneas en memoria).*
 * - **Controlador HTTP que dispara cada método (`FraudController` en `src/interfaces/http/routes/fraud.routes.js`):**
 *   1. `getThresholdsInMemory()` <- Invocado internamente por `TransactionService` en cada `receive` / `simulate`.
 *   2. `list()` <- `FraudController.listThresholds` (`GET /fraud/thresholds`).
 *   3. `update(franja, payload)` <- `FraudController.updateThreshold` (`PUT /fraud/thresholds/:franja`).
 *   *(Además es invocado directamente en pruebas unitarias desde `tests/unit/application/services.test.js`).*
 * - **Delegación a Dominio y Repositorios:**
 *   - Dominio: `getThresholdByTime.DEFAULT_THRESHOLDS`, `ValidationError`, `NotFoundError`.
 *   - Repositorio: `ThresholdRepository` (`findAll`, `updateThreshold`).
 */

// Constantes base de dominio con las franjas horarias predeterminadas (mañana, tarde, noche, madrugada)
const getThresholdByTime = require('../../domain/fraud/getThresholdByTime');
// Errores tipados 400 y 404 traducidos por `errorHandler.js`
const { ValidationError, NotFoundError } = require('../../domain/errors');

class ThresholdService {
  /**
   * Construye el gestor de umbrales clonando las constantes predeterminadas de dominio en memoria
   * para garantizar disponibilidad inmediata incluso antes de sincronizar con PostgreSQL.
   *
   * @param {Object} deps Dependencias inyectadas por `container.js` o `services.test.js`.
   * @param {Object} [deps.thresholdRepository] Repositorio de persistencia de umbrales horarios.
   * @param {Object} [deps.logger] Logger estructurado opcional.
   */
  constructor({ thresholdRepository, logger }) {
    // Repositorio SQL donde persisten los cambios administrativos de umbrales
    this.thresholdRepository = thresholdRepository;
    // Logger contextual del servicio
    this.logger = logger;
    // Copia desacoplada en RAM: fuente de verdad inmediata consultada por `TransactionService` sin ir a BD en cada request
    this.memoryThresholds = getThresholdByTime.DEFAULT_THRESHOLDS.map((t) => ({ ...t }));
    // Bandera de hidratación perezosa para sincronizar desde BD una única vez al listar
    this.initializedFromDb = false;
  }

  /**
   * Devuelve la referencia inmediata a los umbrales activos en memoria ($O(1)$ síncrono).
   * Se invoca internamente desde `TransactionService.#getActiveThresholds()`.
   *
   * @returns {Array<Object>} Lista actual de umbrales por franja horaria.
   */
  getThresholdsInMemory() {
    return this.memoryThresholds;
  }

  /**
   * Obtiene los umbrales horarios vigentes sincronizando perezosamente desde PostgreSQL en la primera lectura,
   * con degradación elegante a memoria si la BD no estuviese disponible.
   * Se dispara desde `FraudController.listThresholds` al recibir `GET /fraud/thresholds`.
   *
   * @returns {Promise<Array<Object>>} Configuración vigente de franjas y ventanas.
   */
  async list() {
    // Sincroniza desde BD únicamente si aún no se ha inicializado y existe repositorio configurado
    if (!this.initializedFromDb && this.thresholdRepository) {
      try {
        // Consulta todas las filas guardadas en `configuracion_umbrales`
        const rows = await this.thresholdRepository.findAll();
        // Si la tabla contiene registros, reemplaza la caché en memoria con copias limpias
        if (Array.isArray(rows) && rows.length > 0) {
          this.memoryThresholds = rows.map((r) => ({ ...r }));
        }
        // Marca la sincronización inicial como completada
        this.initializedFromDb = true;
      } catch (err) {
        // Tolera fallos transitorios de conexión conservando los umbrales operativos en RAM
        this.logger?.warn('Usando umbrales en memoria (no se pudo sincronizar desde BD)', {
          error: err.message,
        });
      }
    }
    // Devuelve siempre la colección activa en memoria
    return this.memoryThresholds;
  }

  /**
   * Actualiza el umbral máximo de transacciones y la duración de la ventana en segundos para una franja horaria,
   * persistiendo el cambio en PostgreSQL y refrescando simultáneamente la caché en memoria.
   * Se dispara desde `FraudController.updateThreshold` al recibir `PUT /fraud/thresholds/:franja` (y en `services.test.js`).
   *
   * @param {string} franja Nombre identificador de la franja (ej. `'mañana'`, `'tarde'`, `'noche'`, `'madrugada'`).
   * @param {Object} [payload={}] Nuevos parámetros numéricos.
   * @param {number|string} payload.umbralTransacciones Máximo de operaciones permitidas (> 0).
   * @param {number|string} payload.ventanaSegundos Tamaño de ventana deslizante en segundos (> 0).
   * @returns {Promise<Object>} Configuración actualizada de la franja.
   */
  async update(franja, { umbralTransacciones, ventanaSegundos } = {}) {
    // Convierte ambos valores entrantes a `Number` para evaluar positividad real
    const parsedUmbral = Number(umbralTransacciones);
    const parsedVentana = Number(ventanaSegundos);

    // Validación de regla de negocio/aplicación: vive UNA SOLA VEZ aquí en el Servicio y NO se repite en la capa HTTP
    // (exige que ambos parámetros existan y sean números estrictamente mayores a cero; cubierto en `services.test.js`)
    if (!parsedUmbral || parsedUmbral <= 0 || !parsedVentana || parsedVentana <= 0) {
      throw new ValidationError('umbralTransacciones y ventanaSegundos son obligatorios');
    }

    // Busca el índice de la franja dentro de la caché en memoria
    const idx = this.memoryThresholds.findIndex((t) => t.franja === franja);

    // Si hay repositorio inyectado, persiste la actualización en la base de datos
    let updated = null;
    if (this.thresholdRepository) {
      updated = await this.thresholdRepository.updateThreshold(
        franja,
        parsedUmbral,
        parsedVentana
      );
    }

    // Validación de existencia de la franja: vive UNA SOLA VEZ aquí y lanza 404 si no existe ni en BD ni en memoria
    if (!updated && idx === -1) {
      throw new NotFoundError('Franja no encontrada');
    }

    // Sincroniza inmediatamente la entrada correspondiente en `memoryThresholds` para efecto instantáneo en `TransactionService`
    if (idx !== -1) {
      this.memoryThresholds[idx] = {
        ...this.memoryThresholds[idx],
        ...(updated || {}),
        umbral_transacciones: parsedUmbral,
        ventana_segundos: parsedVentana,
      };
      // Si se ejecuta en modo solo-memoria, retorna el objeto actualizado desde la caché
      if (!updated) {
        updated = this.memoryThresholds[idx];
      }
    }

    // Registra auditoría del ajuste administrativo aplicado
    this.logger?.info('Umbral y ventana actualizados en memoria y BD', {
      franja,
      umbralTransacciones: parsedUmbral,
      ventanaSegundos: parsedVentana,
    });

    return updated;
  }
}

module.exports = ThresholdService;
