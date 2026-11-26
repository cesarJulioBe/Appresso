/**
 * @file userBehaviorStats.js
 * @description Módulo puro de estadística descriptiva, detección de valores atípicos (outliers),
 * perfilamiento de riesgo conductual por usuario y regresión lineal predictiva sin LLMs,
 * construido sobre la librería matemática `simple-statistics`.
 *
 * - **Capa arquitectónica:** Dominio IA (`src/domain/ai`). Lógica matemática pura, determinista
 *   y libre de efectos secundarios de entrada/salida (no accede directamente a HTTP ni a PostgreSQL).
 * - **Inyección de Dependencias (`container.js`):** Este módulo de dominio no recibe repositorios;
 *   es importado directamente por `AiService` (`src/application/ai/AiService.js`), el cual es
 *   instanciado en `buildContainer()` (`src/container.js`) con los repositorios de infraestructura
 *   (`userRepository`, `orderRepository`, `billingRepository`, `transactionRepository`) y `logger`.
 * - **Controladores HTTP que disparan sus funciones (vía `OperationalController` -> `AiService`):**
 *   1. `computeQuartileSummary`: Función base reutilizada internamente por los tres análisis siguientes
 *      para resumir distribuciones numéricas con cuartiles y vallas de Tukey.
 *   2. `analyzeUserBehaviorProfiles`: Disparada por `OperationalController.getUserProfiles`
 *      (`GET /ai/user-profiles`) y `OperationalController.getExecutiveSummary`
 *      (`GET /operational/summary`) a través de `AiService.getUserBehaviorAnomalies()`.
 *   3. `predictDemandWithSimpleStatistics`: Disparada por `OperationalController.predictDemand`
 *      (`POST /ai/predict-demand`) a través de `AiService.predictDemandAndAmount()`.
 *   4. `discoverOperationalPatterns`: Disparada por `OperationalController.getOperationalPatterns`
 *      (`GET /ai/patterns`) a través de `AiService.getOperationalPatterns()`.
 * - **Delegación a Dominio / Repositorios:** No delega a repositorios (recibe colecciones en memoria
 *   ya recolectadas por `AiService`) y delega los cálculos matemáticos puros a `simple-statistics`.
 */

// Importa la librería matemática `simple-statistics` para cálculos de tendencia central, dispersión, cuartiles, Z-Score y regresión lineal
const ss = require('simple-statistics');

/**
 * Calcula estadísticas descriptivas completas y cuartiles seguros usando `simple-statistics`.
 *
 * Se dispara internamente al analizar montos globales, descuentos globales, montos por usuario,
 * serie histórica de demanda y montos por patrón horario/canal.
 *
 * Fórmulas estadísticas aplicadas:
 * - Media ($\mu$): $\mu = \frac{1}{n}\sum_{i=1}^{n} x_i$ mediante `ss.mean`.
 * - Mediana ($Q_2$): valor central del arreglo ordenado mediante `ss.medianSorted`.
 * - Desviación estándar poblacional ($\sigma$): $\sigma = \sqrt{\frac{1}{n}\sum_{i=1}^{n}(x_i - \mu)^2}$ mediante `ss.standardDeviation`.
 * - Cuartiles ($Q_1, Q_2, Q_3$): percentiles 25%, 50% y 75% sobre muestra ordenada con `ss.quantileSorted`.
 * - Rango intercuartílico ($IQR$): $IQR = Q_3 - Q_1$ mediante `ss.interquartileRange`.
 * - Valla superior de Tukey: $\text{upperFence} = Q_3 + 1.5 \times IQR$ (umbral para detectar outliers superiores).
 * - Valla inferior de Tukey truncada a cero: $\text{lowerFence} = \max(0, Q_1 - 1.5 \times IQR)$.
 *
 * @param {Array<number|string>} [values=[]] Colección cruda de valores numéricos a resumir.
 * @returns {Object} Resumen estadístico redondeado a 2 decimales.
 */
function computeQuartileSummary(values = []) {
  // Convierte cada entrada a `Number` y descarta `NaN`, infinitos o valores negativos para garantizar consistencia matemática
  const numeric = values
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v) && v >= 0);

  // Caso borde: si no quedan datos numéricos válidos, retorna una estructura neutra en ceros evitando excepciones en `simple-statistics`
  if (numeric.length === 0) {
    return {
      count: 0, // Cantidad de observaciones válidas
      min: 0, // Valor mínimo observado
      max: 0, // Valor máximo observado
      mean: 0, // Media aritmética
      median: 0, // Mediana o segundo cuartil (Q2)
      stdDev: 0, // Desviación estándar
      q1: 0, // Primer cuartil (percentil 25)
      q2: 0, // Segundo cuartil (percentil 50 / mediana)
      q3: 0, // Tercer cuartil (percentil 75)
      iqr: 0, // Rango intercuartílico (Q3 - Q1)
      upperFence: 0, // Valla superior de Tukey (Q3 + 1.5 * IQR)
      lowerFence: 0, // Valla inferior de Tukey acotada a >= 0
    };
  }

  // Crea una copia inmutable y la ordena ascendentemente en O(n log n); necesario para usar las rutinas `*Sorted` en O(1)
  const sorted = [...numeric].sort((a, b) => a - b);
  // `ss.mean(sorted)` suma todos los elementos y divide entre `sorted.length` para obtener el promedio aritmético
  const mean = ss.mean(sorted);
  // `ss.medianSorted(sorted)` obtiene el valor central (o el promedio de los dos centrales si n es par), equivalente a Q2
  const median = ss.medianSorted(sorted);
  // `ss.standardDeviation(sorted)` calcula la raíz cuadrada de la varianza poblacional; si solo hay 1 dato, la dispersión es 0
  const stdDev = sorted.length > 1 ? ss.standardDeviation(sorted) : 0;
  // `ss.quantileSorted(sorted, 0.25)` interpola sobre el arreglo ordenado el primer cuartil Q1 (25% inferior de los datos)
  const q1 = ss.quantileSorted(sorted, 0.25);
  // El segundo cuartil Q2 coincide exactamente con la mediana (50% de los datos)
  const q2 = median;
  // `ss.quantileSorted(sorted, 0.75)` obtiene el tercer cuartil Q3 (límite del 75% de los datos)
  const q3 = ss.quantileSorted(sorted, 0.75);
  // `ss.interquartileRange(sorted)` calcula la amplitud central IQR = Q3 - Q1; con un único dato se fija en 0
  const iqr = sorted.length > 1 ? ss.interquartileRange(sorted) : 0;
  // Calcula la valla superior clásica de Tukey (Q3 + 1.5 * IQR): todo valor por encima se considera valor atípico (outlier alto)
  const upperFence = q3 + 1.5 * iqr;
  // Calcula la valla inferior (Q1 - 1.5 * IQR) truncada en 0 porque montos y porcentajes de descuento no son negativos
  const lowerFence = Math.max(0, q1 - 1.5 * iqr);

  // Construye el diccionario de salida formateando cada métrica a número flotante de máximo 2 decimales
  return {
    // Total de elementos analizados en la muestra limpia
    count: sorted.length,
    // `ss.minSorted(sorted)` lee el primer elemento del arreglo ordenado (mínimo en O(1))
    min: Number(ss.minSorted(sorted).toFixed(2)),
    // `ss.maxSorted(sorted)` lee el último elemento del arreglo ordenado (máximo en O(1))
    max: Number(ss.maxSorted(sorted).toFixed(2)),
    // Promedio aritmético redondeado a 2 decimales
    mean: Number(mean.toFixed(2)),
    // Mediana redondeada a 2 decimales
    median: Number(median.toFixed(2)),
    // Desviación estándar redondeada a 2 decimales
    stdDev: Number(stdDev.toFixed(2)),
    // Primer cuartil Q1 redondeado a 2 decimales
    q1: Number(q1.toFixed(2)),
    // Segundo cuartil Q2 redondeado a 2 decimales
    q2: Number(q2.toFixed(2)),
    // Tercer cuartil Q3 redondeado a 2 decimales
    q3: Number(q3.toFixed(2)),
    // Rango intercuartílico IQR redondeado a 2 decimales
    iqr: Number(iqr.toFixed(2)),
    // Umbral superior de valores atípicos redondeado a 2 decimales
    upperFence: Number(upperFence.toFixed(2)),
    // Umbral inferior de valores atípicos redondeado a 2 decimales
    lowerFence: Number(lowerFence.toFixed(2)),
  };
}

/**
 * Construye el perfil estadístico conductual por usuario (clientes y empleados) usando `simple-statistics`.
 *
 * Se dispara desde `AiService.getUserBehaviorAnomalies()` ante `GET /ai/user-profiles` y `GET /operational/summary`.
 * Consolida el historial transversal (facturas, pedidos, pagos y transacciones), calcula cuartiles individuales
 * frente a cuartiles globales, mide el `zScore` del monto máximo y pondera un `anomalyScore` en $[0, 100]$.
 *
 * @param {Object} params Colecciones operativas recolectadas desde los repositorios.
 * @returns {Object} Estadísticas globales del sistema y lista de perfiles ordenada de mayor a menor riesgo.
 */
function analyzeUserBehaviorProfiles({
  users = [],
  orders = [],
  invoices = [],
  payments = [],
  transactions = [],
}) {
  // 1. Reúne todos los montos positivos de facturas, transacciones y pedidos para construir la línea base global del negocio
  const allAmounts = [
    // Extrae el total numérico de cada factura emitida
    ...invoices.map((i) => Number(i.total || 0)),
    // Extrae el valor monetario de cada transacción monitoreada
    ...transactions.map((t) => Number(t.valor || 0)),
    // Extrae el monto de cada pedido invocando el método de entidad `totalAmount()` si existe, o la propiedad plana `total`
    ...orders.map((o) =>
      typeof o.totalAmount === 'function' ? o.totalAmount() : Number(o.total || 0)
    ),
  ].filter((v) => v > 0); // Descarta registros en cero para no sesgar los cuartiles de montos reales

  // Extrae todos los porcentajes de descuento aplicados en facturas (>= 0) para medir la distribución global de descuentos
  const allDiscountPcts = invoices
    .map((i) => Number(i.porcentaje_descuento ?? 0))
    .filter((v) => v >= 0);

  // Calcula cuartiles globales de montos; si la BD aún está vacía usa una semilla representativa de cafetería en COP
  const globalAmountStats = computeQuartileSummary(
    allAmounts.length > 0 ? allAmounts : [10000, 18000, 25000, 32000, 45000]
  );
  // Calcula cuartiles globales de porcentaje de descuento; usa [0..20%] como referencia base si aún no hay facturas
  const globalDiscountStats = computeQuartileSummary(
    allDiscountPcts.length > 0 ? allDiscountPcts : [0, 5, 10, 15, 20]
  );

  // Mapa hash en memoria O(1) para agrupar todas las operaciones pertenecientes a cada usuario
  const userBuckets = new Map();

  // Función auxiliar interna que obtiene o inicializa el contenedor acumulador (`bucket`) de un usuario dado su identificador/clave
  const ensureBucket = (key, userMeta = {}) => {
    // Normaliza la clave en minúsculas y sin espacios laterales para evitar duplicar cubetas por diferencias de formato
    const cleanKey = String(key || 'anonimo').toLowerCase().trim();
    // Si el usuario aún no tiene cubeta registrada, crea su estructura acumuladora inicial
    if (!userBuckets.has(cleanKey)) {
      userBuckets.set(cleanKey, {
        userId: userMeta.id || null, // ID numérico del usuario en BD si se conoce
        nombre: userMeta.nombre || userMeta.name || String(key), // Nombre legible para visualización
        email: userMeta.email || (String(key).includes('@') ? String(key) : `${cleanKey}@appresso.co`), // Correo asociado o sintético
        rol: userMeta.rol || 'cliente', // Rol operativo (cliente, empleado, admin)
        amounts: [], // Historial de montos monetarios operados por este usuario
        discountsPct: [], // Historial de porcentajes de descuento recibidos o aplicados
        discountsValue: [], // Historial de valores absolutos descontados en COP
        totalOperations: 0, // Contador total de eventos (facturas + pedidos + pagos + transacciones)
        cancelledCount: 0, // Contador de facturas o pedidos anulados/cancelados
        invalidHashOrReceiptCount: 0, // Contador de firmas corruptas, facturas alteradas o comprobantes falsos
        nightOperationsCount: 0, // Contador de transacciones ejecutadas en madrugada (00:00 a 05:59)
        channels: {}, // Mapa de frecuencia por canal operativo (presencial, web, app, domicilio)
        paymentMethods: {}, // Mapa de frecuencia por medio de pago empleado
      });
    }
    // Devuelve la referencia al acumulador del usuario
    return userBuckets.get(cleanKey);
  };

  // Índice rápido `id -> usuario` en O(1) para cruzar llaves foráneas `usuario_id` / `empleado_id` sin búsquedas lineales repetidas
  const userById = new Map();
  // Registra previamente a todos los usuarios del catálogo maestro en el índice y en `userBuckets`
  for (const u of users) {
    userById.set(Number(u.id), u);
    ensureBucket(u.email || u.nombre || `user_${u.id}`, u);
  }

  // 2. Integra el historial de facturas (captura montos, descuentos abusivos, anulaciones y alteraciones de integridad)
  for (const inv of invoices) {
    // Resuelve los metadatos del usuario o empleado responsable de la factura usando el índice `userById`
    const userObj =
      userById.get(Number(inv.usuario_id || inv.empleado_id)) ||
      { id: inv.usuario_id, nombre: inv.customer || `Usuario #${inv.usuario_id || 1}` };
    // Determina la clave canónica de agrupación priorizando el email
    const key = userObj.email || userObj.nombre || `user_${inv.usuario_id || 1}`;
    // Recupera el acumulador estadístico del usuario
    const bucket = ensureBucket(key, userObj);

    // Convierte total, porcentaje de descuento y valor de descuento a tipos numéricos seguros
    const total = Number(inv.total || 0);
    const discountPct = Number(inv.porcentaje_descuento || 0);
    const discountVal = Number(inv.descuento || 0);

    // Incrementa el número total de operaciones atribuidas al usuario
    bucket.totalOperations++;
    // Registra el monto facturado si es positivo para el cálculo posterior de cuartiles
    if (total > 0) bucket.amounts.push(total);
    // Almacena tanto el porcentaje como el valor monetario del descuento aplicado
    bucket.discountsPct.push(discountPct);
    bucket.discountsValue.push(discountVal);

    // Contabiliza si la factura terminó en estado `Anulada` (señal de posible fraude de caja)
    if (inv.estado === 'Anulada') bucket.cancelledCount++;
    // Contabiliza si la factura fue marcada como `Alterada` por violación de cadena de hash
    if (inv.estado === 'Alterada') bucket.invalidHashOrReceiptCount++;

    // Incrementa el contador del canal por el cual se emitió la factura
    const ch = inv.canal || 'presencial';
    bucket.channels[ch] = (bucket.channels[ch] || 0) + 1;
  }

  // 3. Integra el historial de pedidos operativos y de cafetería
  for (const ord of orders) {
    // Cruza el pedido con su usuario registrado o construye un descriptor básico a partir del nombre del cliente
    const userObj = userById.get(Number(ord.usuario_id || ord.usuarioId)) || {
      nombre: ord.customer || 'Cliente',
    };
    // Construye la clave de agrupación del cliente
    const key = userObj.email || ord.customer || `user_${ord.usuario_id || 1}`;
    // Obtiene el contenedor del cliente
    const bucket = ensureBucket(key, userObj);

    // Calcula el importe del pedido soportando instancias de la entidad `Order` o filas planas de BD
    const amount =
      typeof ord.totalAmount === 'function'
        ? ord.totalAmount()
        : Number(ord.total || 0);
    // Suma una operación al perfil del usuario
    bucket.totalOperations++;
    // Añade el importe a la muestra de montos del usuario
    if (amount > 0) bucket.amounts.push(amount);
    // Si el pedido fue cancelado/anulado, incrementa el contador de cancelaciones del perfil
    if (ord.status === 'Cancelled' || ord.status === 'Anulado') {
      bucket.cancelledCount++;
    }
    // Registra la frecuencia del canal de venta del pedido
    const ch = ord.canal || 'presencial';
    bucket.channels[ch] = (bucket.channels[ch] || 0) + 1;
  }

  // 4. Integra el historial de pagos y validación de comprobantes
  for (const pay of payments) {
    // Busca al titular del pago en el índice en memoria
    const userObj = userById.get(Number(pay.usuario_id)) || {
      id: pay.usuario_id,
      nombre: `Usuario #${pay.usuario_id || 1}`,
    };
    // Define la llave de agrupación del usuario pagador
    const key = userObj.email || userObj.nombre || `user_${pay.usuario_id || 1}`;
    // Obtiene su cubeta estadística
    const bucket = ensureBucket(key, userObj);

    // Contabiliza el evento de pago
    bucket.totalOperations++;
    // Incorpora el monto pagado a la distribución monetaria del usuario
    if (Number(pay.monto) > 0) bucket.amounts.push(Number(pay.monto));
    // Si el comprobante fue rechazado criptográficamente o marcado como sospechoso, suma alerta crítica de integridad
    if (pay.comprobante_valido === false || pay.estado === 'Sospechoso' || pay.estado === 'Rechazado') {
      bucket.invalidHashOrReceiptCount++;
    }
    // Acumula el conteo del medio de pago utilizado (Efectivo, Tarjeta, Transferencia, etc.)
    const method = pay.metodo_pago || 'Efectivo';
    bucket.paymentMethods[method] = (bucket.paymentMethods[method] || 0) + 1;
  }

  // 5. Integra las transacciones del motor antifraude en tiempo real
  for (const txn of transactions) {
    // Agrupa por email de la transacción o por su ID de usuario asociado
    const key = txn.email || `user_${txn.usuario_id || 1}`;
    const userObj = userById.get(Number(txn.usuario_id)) || {
      id: txn.usuario_id,
      email: txn.email,
      nombre: txn.email ? txn.email.split('@')[0] : `Usuario #${txn.usuario_id}`,
    };
    const bucket = ensureBucket(key, userObj);

    // Extrae el valor monetario de la transacción
    const val = Number(txn.valor || 0);
    // Incrementa el total de operaciones del perfil
    bucket.totalOperations++;
    // Añade el valor a la distribución de montos del usuario
    if (val > 0) bucket.amounts.push(val);
    // Si la transacción tuvo firma HMAC inválida o disparó anomalía por ráfaga en ventana deslizante, incrementa contador crítico
    if (txn.estado === 'Hash inválido' || txn.es_anomalia) {
      bucket.invalidHashOrReceiptCount++;
    }
    // Extrae la hora del día (0..23) de la transacción para evaluar comportamiento nocturno inusual
    const hour = txn.fecha_txn ? new Date(txn.fecha_txn).getHours() : 12;
    // Las operaciones entre las 00:00 y las 05:59 se contabilizan como actividad de madrugada
    if (hour >= 0 && hour <= 5) {
      bucket.nightOperationsCount++;
    }
    // Registra el método de pago empleado en la transacción
    const method = txn.metodo_pago || 'Tarjeta';
    bucket.paymentMethods[method] = (bucket.paymentMethods[method] || 0) + 1;
  }

  // Arreglo donde se depositarán los perfiles estadísticos calculados para cada usuario activo
  const profiles = [];

  // 6. Evalúa estadísticamente cada cubeta de usuario mediante cuartiles, IQR, Z-Score y puntaje de anomalía
  for (const bucket of userBuckets.values()) {
    // Omite usuarios registrados en catálogo que aún no tienen ninguna operación histórica
    if (bucket.totalOperations === 0 && bucket.amounts.length === 0) continue;

    // Calcula Q1, Q2, Q3, IQR, media, desviación estándar y vallas sobre los montos operados por este usuario
    const quartiles = computeQuartileSummary(bucket.amounts);
    // Calcula el resumen intercuartílico de los porcentajes de descuento asociados al usuario
    const discountQuartiles = computeQuartileSummary(bucket.discountsPct);
    // Determina el porcentaje de anulaciones del usuario respecto a su volumen total de operaciones
    const cancellationRate =
      bucket.totalOperations > 0
        ? Number(((bucket.cancelledCount / bucket.totalOperations) * 100).toFixed(2))
        : 0;
    // Toma el descuento máximo que haya recibido o otorgado el usuario
    const maxDiscountPct = discountQuartiles.max;

    // Define el umbral efectivo de outlier superior como el máximo entre la valla global (Q3 + 1.5*IQR), la propia y un piso de $150.000 COP
    const upperFence = Math.max(
      globalAmountStats.upperFence || 150000,
      quartiles.upperFence || 150000
    );
    // Filtra todos los montos individuales del usuario que superan la valla superior `upperFence`
    const outlierAmounts = bucket.amounts.filter((a) => a > upperFence);

    // `ss.zScore(x, mean, stdDev)` calcula cuántas desviaciones estándar se aleja el monto máximo del usuario respecto a la media global: z = (x - μ) / σ
    const maxAmountZScore =
      globalAmountStats.stdDev > 0
        ? Number(
            ss.zScore(quartiles.max, globalAmountStats.mean, globalAmountStats.stdDev).toFixed(2)
          )
        : 0;

    // Inicializa el puntaje compuesto de anomalía (`anomalyScore` en escala 0..100) y la lista de alertas explicativas
    let anomalyScore = 0;
    const alerts = [];

    // Regla 1: Descuento abusivo (> 30% máximo permitido por política) o atípico respecto al rango intercuartílico global
    if (maxDiscountPct > 30) {
      anomalyScore += 35; // Penalización alta (+35 puntos) por violar el tope comercial del 30%
      alerts.push({
        type: 'DESCUENTO_ABUSADO',
        severity: 'Alta',
        message: `Descuento máximo aplicado de ${maxDiscountPct}% supera el umbral permitido (30%) y Q3+1.5*IQR`,
      });
    } else if (
      discountQuartiles.upperFence > 0 &&
      maxDiscountPct > Math.max(20, globalDiscountStats.upperFence)
    ) {
      anomalyScore += 18; // Penalización moderada (+18 puntos) cuando supera la valla Q3 + 1.5*IQR global de descuentos
      alerts.push({
        type: 'DESCUENTO_ATIPICO_IQR',
        severity: 'Media',
        message: `Descuento (${maxDiscountPct}%) por encima del rango intercuartílico esperado`,
      });
    }

    // Regla 2: Reiteración de anulaciones (>= 2 eventos absolutos o >= 25% de tasa de cancelación)
    if (bucket.cancelledCount >= 2 || cancellationRate >= 25) {
      anomalyScore += 30; // Suma +30 puntos de riesgo por patrón sospechoso de reversión de ventas
      alerts.push({
        type: 'ANULACIONES_SOSPECHOSAS',
        severity: 'Alta',
        message: `${bucket.cancelledCount} anulaciones registradas (${cancellationRate}% de sus operaciones)`,
      });
    }

    // Regla 3: Violaciones criptográficas (hash inválido, factura alterada, comprobante falso o ráfaga anómala)
    if (bucket.invalidHashOrReceiptCount > 0) {
      // Suma 25 puntos por incidente crítico con tope parcial de 40 puntos
      anomalyScore += Math.min(40, bucket.invalidHashOrReceiptCount * 25);
      alerts.push({
        type: 'COMPROBANTE_O_FIRMA_INVALIDA',
        severity: 'Crítica',
        message: `${bucket.invalidHashOrReceiptCount} operación(es) con comprobante falso, firma alterada o ráfaga anómala`,
      });
    }

    // Regla 4: Presencia de montos atípicos por valla de Tukey (Q3 + 1.5*IQR) o Z-Score elevado (> 2.2 desviaciones estándar)
    if (outlierAmounts.length > 0 || maxAmountZScore > 2.2) {
      anomalyScore += 20; // Añade +20 puntos por desviación monetaria extrema
      alerts.push({
        type: 'MONTO_ATIPICO_CUARTIL',
        severity: 'Media',
        message: `${outlierAmounts.length || 1} monto(s) atípico(s) detectado(s) (Máx: $${quartiles.max.toLocaleString()}, Z-Score: ${maxAmountZScore})`,
      });
    }

    // Regla 5: Concentración reiterada de operaciones en horario de madrugada (00:00 - 05:59)
    if (bucket.nightOperationsCount >= 3) {
      anomalyScore += 15; // Añade +15 puntos por patrón horario inusual en negocio gastronómico
      alerts.push({
        type: 'PATRON_HORARIO_MADRUGADA',
        severity: 'Media',
        message: `${bucket.nightOperationsCount} operaciones realizadas en horario de madrugada (00:00 - 05:59)`,
      });
    }

    // Acota el `anomalyScore` final al intervalo cerrado [0, 100] redondeado al entero más cercano
    anomalyScore = Math.min(100, Math.round(anomalyScore));

    // Clasifica categóricamente el riesgo conductual según umbrales escalonados sobre `anomalyScore`
    const classification =
      anomalyScore >= 50
        ? 'SOSPECHOSO'
        : anomalyScore >= 25
          ? 'EN_OBSERVACION'
          : 'NORMAL';

    // Agrega el perfil consolidado del usuario al listado de resultados
    profiles.push({
      userId: bucket.userId,
      nombre: bucket.nombre,
      email: bucket.email,
      rol: bucket.rol,
      totalOperations: bucket.totalOperations,
      cancelledCount: bucket.cancelledCount,
      cancellationRatePct: cancellationRate,
      maxDiscountPct,
      avgDiscountPct: discountQuartiles.mean,
      invalidHashOrReceiptCount: bucket.invalidHashOrReceiptCount,
      quartiles: {
        q1: quartiles.q1,
        q2: quartiles.q2,
        q3: quartiles.q3,
        iqr: quartiles.iqr,
        upperFence: Number(upperFence.toFixed(2)),
        mean: quartiles.mean,
        stdDev: quartiles.stdDev,
        max: quartiles.max,
      },
      maxAmountZScore,
      outlierCount: outlierAmounts.length,
      anomalyScore,
      classification,
      alerts,
      channels: bucket.channels,
      paymentMethods: bucket.paymentMethods,
    });
  }

  // Ordena los perfiles descendentemente por `anomalyScore` para priorizar en pantalla a los usuarios más riesgosos
  profiles.sort((a, b) => b.anomalyScore - a.anomalyScore);

  // Retorna métricas globales de contexto junto con el arreglo clasificado de perfiles de usuario
  return {
    globalStats: {
      amounts: globalAmountStats,
      discounts: globalDiscountStats,
      totalUsersAnalyzed: profiles.length,
      suspiciousUsersCount: profiles.filter((p) => p.classification === 'SOSPECHOSO').length,
      observationUsersCount: profiles.filter((p) => p.classification === 'EN_OBSERVACION').length,
    },
    profiles,
  };
}

/**
 * Predice demanda y ventas futuras usando Regresión Lineal Simple por Mínimos Cuadrados Ordinarios (OLS)
 * provista por `simple-statistics` (`ss.linearRegression`, `ss.linearRegressionLine`, `ss.rSquared`).
 *
 * Se dispara desde `AiService.predictDemandAndAmount()` cuando `OperationalController.predictDemand`
 * atiende `POST /ai/predict-demand`.
 *
 * Fórmulas aplicadas por `simple-statistics`:
 * - Pendiente ($m$): $m = \frac{\sum (x_i - \bar{x})(y_i - \bar{y})}{\sum (x_i - \bar{x})^2}$
 * - Intercepto ($b$): $b = \bar{y} - m\bar{x}$
 * - Recta predictora: $\hat{y}(x) = m \cdot x + b$
 * - Coeficiente de determinación ($R^2$): $R^2 = 1 - \frac{\sum (y_i - \hat{y}_i)^2}{\sum (y_i - \bar{y})^2} \in [0, 1]$
 *
 * @param {Array<number>} [dailySeries=[]] Serie temporal diaria de demanda/ventas históricas.
 * @param {number} [horizonDays=7] Cantidad de días futuros a proyectar.
 * @returns {Object} Parámetros $m$, $b$, $R^2$, tendencia cualitativa, cuartiles históricos y proyecciones.
 */
function predictDemandWithSimpleStatistics(dailySeries = [], horizonDays = 7) {
  // Transforma la serie 1D en pares coordenados `[x, y]` donde `x = idx + 1` (día 1..n) y `y = valor numérico >= 0`
  const cleanSeries = dailySeries
    .map((val, idx) => [idx + 1, Number(val)])
    .filter((pair) => Number.isFinite(pair[1]) && pair[1] >= 0);

  // Una recta requiere al menos 2 puntos distintos; si hay menos, retorna respuesta degenerada segura sin error matemático
  if (cleanSeries.length < 2) {
    return {
      slope: 0,
      intercept: 0,
      rSquared: 0,
      trend: 'estable',
      forecasts: [],
    };
  }

  // `ss.linearRegression(cleanSeries)` ajusta por mínimos cuadrados la pendiente `m` y el corte con el eje Y `b`
  const regression = ss.linearRegression(cleanSeries);
  // `ss.linearRegressionLine(regression)` construye la clausura evaluadora `x => regression.m * x + regression.b`
  const predictFn = ss.linearRegressionLine(regression);
  // `ss.rSquared(cleanSeries, predictFn)` mide la bondad de ajuste R² comparando la varianza residual frente a la varianza total
  const r2 = ss.rSquared(cleanSeries, predictFn);
  // Guarda el índice del último día histórico observado (`n`) como punto de partida del horizonte futuro
  const n = cleanSeries.length;

  // Proyecta la demanda esperada para cada uno de los próximos `horizonDays` días (`n + 1` hasta `n + horizonDays`)
  const forecasts = [];
  for (let d = 1; d <= horizonDays; d++) {
    // Índice temporal futuro sobre el eje X
    const futureDay = n + d;
    // Evalúa la ecuación lineal y = m * futureDay + b
    const rawPred = predictFn(futureDay);
    forecasts.push({
      dayIndex: futureDay,
      daysAhead: d,
      // Trunca en 0 para impedir demandas negativas si la pendiente es decreciente pronunciada
      predictedDemand: Math.max(0, Number(rawPred.toFixed(2))),
    });
  }

  // Clasifica la dirección de la tendencia según la magnitud y signo de la pendiente `m`
  const trend =
    regression.m > 0.5 ? 'creciente' : regression.m < -0.5 ? 'decreciente' : 'estable';

  // Devuelve los coeficientes de la regresión, el R² saneado (evita NaN cuando todos los Y son idénticos), cuartiles y pronósticos
  return {
    slope: Number(regression.m.toFixed(4)),
    intercept: Number(regression.b.toFixed(4)),
    rSquared: Number((Number.isFinite(r2) ? r2 : 0).toFixed(4)),
    trend,
    historicalStats: computeQuartileSummary(cleanSeries.map((p) => p[1])),
    forecasts,
  };
}

/**
 * Descubre patrones operativos agregados por franja horaria (00:00..23:00), canal comercial y medio de pago.
 *
 * Se dispara desde `AiService.getOperationalPatterns()` cuando `OperationalController.getOperationalPatterns`
 * responde a `GET /ai/patterns`.
 *
 * @param {Object} params Colecciones de pedidos, facturas, pagos y transacciones del sistema.
 * @returns {Object} Cuartiles globales de montos, hora pico, hora crítica de anomalías y desgloses agregados.
 */
function discoverOperationalPatterns({
  orders = [],
  invoices = [],
  payments = [],
  transactions = [],
}) {
  // Preconstruye las 24 cubetas horarias del día (00:00 a 23:00) para acumular volumen, dinero y anomalías en O(1) por acceso directo
  const byHour = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: `${String(hour).padStart(2, '0')}:00`,
    operations: 0,
    totalAmount: 0,
    anomalies: 0,
  }));

  // Inicializa acumuladores de conteo y monto para los 4 canales comerciales soportados por Appresso
  const byChannel = {
    presencial: { count: 0, amount: 0 },
    web: { count: 0, amount: 0 },
    app: { count: 0, amount: 0 },
    domicilio: { count: 0, amount: 0 },
  };

  // Mapa dinámico para contabilizar uso, volumen monetario y anomalías por método de pago
  const byPaymentMethod = {};
  // Lista plana de todos los montos positivos para resumir sus cuartiles al final del recorrido
  const allAmounts = [];

  // Helper interno que proyecta cualquier registro operativo sobre las cubetas horarias, de canal y de medio de pago
  const registerRecord = ({ date, amount, channel, method, isAnomaly }) => {
    // Parsea la fecha del evento; si no viene informada usa la fecha actual como respaldo
    const d = date ? new Date(date) : new Date();
    // Obtiene la hora local [0..23] o usa las 12:00 si la cadena de fecha fuese inválida
    const hour = Number.isFinite(d.getHours()) ? d.getHours() : 12;
    // Convierte el monto a número seguro
    const val = Number(amount || 0);

    // Acumula cantidad de operaciones, suma monetaria y anomalías en la hora correspondiente
    byHour[hour].operations += 1;
    byHour[hour].totalAmount += val;
    if (isAnomaly) byHour[hour].anomalies += 1;

    // Si el evento especifica canal, incrementa el canal conocido (o `presencial` por defecto)
    if (channel) {
      const ch = byChannel[channel] ? channel : 'presencial';
      byChannel[ch].count += 1;
      byChannel[ch].amount += val;
    }

    // Si el evento incluye medio de pago, inicializa su cubeta si no existe y actualiza sus métricas
    if (method) {
      if (!byPaymentMethod[method]) {
        byPaymentMethod[method] = { count: 0, amount: 0, anomalies: 0 };
      }
      byPaymentMethod[method].count += 1;
      byPaymentMethod[method].amount += val;
      if (isAnomaly) byPaymentMethod[method].anomalies += 1;
    }

    // Guarda el monto positivo para el resumen intercuartílico global
    if (val > 0) allAmounts.push(val);
  };

  // Recorre los pedidos registrando su fecha, total, canal y marcando como anomalía si fueron cancelados
  for (const o of orders) {
    const amount =
      typeof o.totalAmount === 'function' ? o.totalAmount() : Number(o.total || 0);
    registerRecord({
      date: o.createdAt || o.created_at,
      amount,
      channel: o.canal || 'presencial',
      isAnomaly: o.status === 'Cancelled',
    });
  }

  // Recorre las facturas marcando anomalía cuando están anuladas, alteradas o tienen descuento > 30%
  for (const inv of invoices) {
    registerRecord({
      date: inv.created_at,
      amount: inv.total,
      channel: inv.canal || 'presencial',
      isAnomaly:
        inv.estado === 'Anulada' ||
        inv.estado === 'Alterada' ||
        Number(inv.porcentaje_descuento || 0) > 30,
    });
  }

  // Recorre los pagos marcando anomalía si el comprobante es inválido o el estado difiere de `Aprobado`
  for (const pay of payments) {
    registerRecord({
      date: pay.fecha_pago,
      amount: pay.monto,
      method: pay.metodo_pago || 'Efectivo',
      isAnomaly: pay.comprobante_valido === false || pay.estado !== 'Aprobado',
    });
  }

  // Recorre las transacciones antifraude marcando anomalía según la bandera `es_anomalia` o hash inválido
  for (const txn of transactions) {
    registerRecord({
      date: txn.fecha_txn,
      amount: txn.valor,
      method: txn.metodo_pago || 'Tarjeta',
      isAnomaly: Boolean(txn.es_anomalia) || txn.estado === 'Hash inválido',
    });
  }

  // Identifica la franja horaria de mayor tráfico comercial ordenando una copia de `byHour` de mayor a menor operaciones
  const peakHour = [...byHour].sort((a, b) => b.operations - a.operations)[0] || byHour[12];
  // Identifica la franja horaria con mayor concentración de incidentes/anomalías
  const highestAnomalyHour =
    [...byHour].sort((a, b) => b.anomalies - a.anomalies)[0] || byHour[0];
  // Identifica el nombre del canal comercial con mayor número de operaciones acumuladas
  const dominantChannel = Object.entries(byChannel).sort(
    (a, b) => b[1].count - a[1].count
  )[0]?.[0] || 'presencial';

  // Entrega el diagnóstico consolidado de patrones operativos junto con los cuartiles de montos
  return {
    amountQuartiles: computeQuartileSummary(allAmounts),
    peakHour,
    highestAnomalyHour,
    dominantChannel,
    byHour,
    byChannel,
    byPaymentMethod,
  };
}

// Exporta las funciones estadísticas puras para `AiService` y las pruebas unitarias de dominio
module.exports = {
  computeQuartileSummary,
  analyzeUserBehaviorProfiles,
  predictDemandWithSimpleStatistics,
  discoverOperationalPatterns,
};
