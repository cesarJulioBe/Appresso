/**
 * @file ThresholdRepository.js
 * @description Repositorio de acceso a datos para las reglas de negocio dinámicas en `umbrales_horarios`.
 *
 * Arquitectura y Diseño:
 * - (a) Capa: Infraestructura (Base de Datos / Repositorios).
 * - (b) Responsabilidad única (SRP): Leer y actualizar en PostgreSQL la parametrización de límites de
 *       velocidad transaccional (`umbral_transacciones` y `ventana_segundos`) configurados por franja horaria.
 * - (c) Quién lo dispara / invoca:
 *       - Instanciado en `src/container.js` con inyección de `{ db }`.
 *       - Invocado exclusivamente por `ThresholdService` (`src/application/fraud/ThresholdService.js`),
 *         el cual a su vez abastece a `TransactionService` y `FraudController`.
 * - (d) Buenas prácticas aplicadas:
 *       - Inyección de dependencias (`{ db }`) para aislar completamente el motor SQL de las reglas de fraude.
 *       - Sentencia `UPDATE` parametrizada (`$1, $2, $3`) con `RETURNING *` evitando lecturas adicionales post-escritura.
 */

// Define la clase repositorio encargada de consultar y modificar la tabla 'umbrales_horarios'
class ThresholdRepository {
  /**
   * Inicializa el repositorio almacenando el adaptador de conexión a base de datos.
   *
   * @param {object} deps - Dependencias inyectadas.
   * @param {object} deps.db - Adaptador de PostgreSQL con método `query(text, params)`.
   */
  constructor({ db }) {
    // Asigna la conexión a la propiedad interna de la instancia
    this.db = db;
  }

  /**
   * Recupera todas las franjas horarias configuradas junto con sus límites máximos de transacciones y ventanas de tiempo.
   *
   * Consulta ejecutada: `SELECT * FROM umbrales_horarios`
   *
   * @returns {Promise<Array<object>>} Arreglo con la configuración vigente de todas las franjas horarias.
   */
  async findAll() {
    // Ejecuta lectura completa de la tabla de parametrización antifraude
    const result = await this.db.query('SELECT * FROM umbrales_horarios');
    // Retorna el arreglo de filas con cada franja horaria y sus umbrales
    return result.rows;
  }

  /**
   * Actualiza los parámetros de control antifraude para una franja horaria específica (ej. `'madrugada'`, `'manana'`, `'tarde'`, `'noche'`).
   *
   * Consulta ejecutada:
   * `UPDATE umbrales_horarios SET umbral_transacciones = $1, ventana_segundos = $2 WHERE franja = $3 RETURNING *`
   *
   * @param {string} franja - Identificador textual de la franja horaria a ajustar.
   * @param {number} umbralTransacciones - Cantidad máxima permitida de transacciones dentro de la ventana.
   * @param {number} ventanaSegundos - Duración en segundos de la ventana deslizante de evaluación.
   * @returns {Promise<object|null>} Registro actualizado de la franja horaria o `null` si la franja no existe.
   */
  async updateThreshold(franja, umbralTransacciones, ventanaSegundos) {
    // Ejecuta UPDATE parametrizado filtrando por el nombre de la franja y devolviendo la fila resultante
    const result = await this.db.query(
      `UPDATE umbrales_horarios SET umbral_transacciones = $1, ventana_segundos = $2 WHERE franja = $3 RETURNING *`,
      [umbralTransacciones, ventanaSegundos, franja]
    );
    // Retorna la configuración actualizada o null cuando la franja indicada no existe en base de datos
    return result.rows[0] || null;
  }
}

// Exporta la clase ThresholdRepository para su uso en el contenedor de inyección de dependencias
module.exports = ThresholdRepository;
