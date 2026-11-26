/**
 * @file UserRepository.js
 * @description Repositorio de acceso a datos para la tabla `usuarios` en PostgreSQL.
 *
 * Arquitectura y Diseño:
 * - (a) Capa: Infraestructura (Base de Datos / Repositorios).
 * - (b) Responsabilidad única (SRP): Encapsular todas las operaciones CRUD y búsquedas por identidad
 *       (ID o correo electrónico) sobre la tabla `usuarios`, sin mezclar reglas de negocio ni validaciones HTTP.
 * - (c) Quién lo dispara / invoca:
 *       - Instanciado en `src/container.js` con inyección de `{ db }`.
 *       - Invocado por `TransactionService` (`findOrCreate`), `OperationalService` (CRUD de clientes/empleados),
 *         `DataQualityService` (auditoría y saneamiento de perfiles) y `AiService` (consulta de historial por usuario).
 * - (d) Buenas prácticas aplicadas:
 *       - Inyección de dependencias por constructor (`{ db }`) facilitando mocks en pruebas unitarias.
 *       - Consultas 100 % parametrizadas (`$1, $2...`) que previenen ataques de SQL Injection.
 *       - Actualización parcial segura con `COALESCE($n, columna)` y retorno inmediato mediante `RETURNING *`.
 */

// Define la clase repositorio responsable de interactuar con la tabla 'usuarios'
class UserRepository {
  /**
   * Inicializa el repositorio recibiendo el adaptador de conexión a PostgreSQL.
   *
   * @param {object} deps - Objeto de dependencias inyectadas.
   * @param {object} deps.db - Cliente o pool de base de datos que expone `query(text, params)`.
   */
  constructor({ db }) {
    // Almacena la referencia al adaptador de base de datos en la instancia
    this.db = db;
  }

  /**
   * Busca un usuario único a partir de su dirección de correo electrónico exacta.
   *
   * Consulta ejecutada: `SELECT * FROM usuarios WHERE email = $1`
   *
   * @param {string} email - Correo electrónico del usuario a consultar.
   * @returns {Promise<object|null>} Fila completa del usuario encontrado o `null` si no existe.
   */
  async findByEmail(email) {
    // Ejecuta la búsqueda parametrizada filtrando por la columna 'email'
    const result = await this.db.query('SELECT * FROM usuarios WHERE email = $1', [email]);
    // Retorna el primer registro coincidente o null cuando la consulta no arroja resultados
    return result.rows[0] || null;
  }

  /**
   * Busca un usuario único por su identificador primario numérico.
   *
   * Consulta ejecutada: `SELECT * FROM usuarios WHERE id = $1`
   *
   * @param {number|string} id - Identificador primario (`id`) del usuario.
   * @returns {Promise<object|null>} Objeto con las columnas del usuario o `null` si no existe.
   */
  async findById(id) {
    // Consulta parametrizada por clave primaria en la tabla 'usuarios'
    const result = await this.db.query('SELECT * FROM usuarios WHERE id = $1', [id]);
    // Devuelve la fila hallada o null para evitar retornar 'undefined' a la capa de aplicación
    return result.rows[0] || null;
  }

  /**
   * Obtiene un usuario existente por correo electrónico o lo registra automáticamente si aún no existe.
   * Muy utilizado en flujos transaccionales ágiles donde solo llega el email del comprador.
   *
   * Consulta ejecutada (si no existe): `INSERT INTO usuarios (nombre, email) VALUES ($1, $2) RETURNING *`
   *
   * @param {string} email - Correo electrónico del usuario a buscar o registrar.
   * @param {string|null} [nombre=null] - Nombre opcional; si se omite, se infiere del prefijo antes de `@`.
   * @returns {Promise<object>} Registro del usuario existente o recién insertado en PostgreSQL.
   */
  async findOrCreate(email, nombre = null) {
    // Verifica primero si ya existe un usuario registrado con ese correo electrónico
    const existing = await this.findByEmail(email);
    // Si ya existe en base de datos, lo devuelve inmediatamente sin realizar escrituras
    if (existing) return existing;

    // Determina el nombre visible usando el parámetro recibido, la parte local del email o el texto genérico 'Cliente'
    const displayName = nombre || (email ? String(email).split('@')[0] : 'Cliente');
    // Inserta el nuevo usuario de forma parametrizada solicitando todas las columnas generadas con RETURNING *
    const result = await this.db.query(
      `INSERT INTO usuarios (nombre, email) VALUES ($1, $2) RETURNING *`,
      [displayName, email]
    );
    // Retorna la fila recién creada por PostgreSQL (incluyendo id y valores por defecto)
    return result.rows[0];
  }

  /**
   * Recupera el listado completo de usuarios ordenados ascendentemente por su identificador primario.
   *
   * Consulta ejecutada: `SELECT * FROM usuarios ORDER BY id ASC`
   *
   * @returns {Promise<Array<object>>} Arreglo con todos los registros de la tabla `usuarios`.
   */
  async listAll() {
    // Ejecuta lectura completa con orden determinista por clave primaria ascendente
    const result = await this.db.query('SELECT * FROM usuarios ORDER BY id ASC');
    // Devuelve el arreglo de filas obtenidas (vacío si no hay registros)
    return result.rows;
  }

  /**
   * Crea un nuevo usuario completo especificando su perfil operativo, rol y clave normalizada.
   *
   * Consulta ejecutada:
   * `INSERT INTO usuarios (nombre, nombre_normalizado, email, rol, documento, telefono, estado) VALUES ($1..$7) RETURNING *`
   *
   * @param {object} data - Datos del usuario a crear.
   * @param {string} data.nombre - Nombre completo del usuario.
   * @param {string} data.nombreNormalizado - Nombre limpio y normalizado para deduplicación.
   * @param {string} data.email - Dirección de correo electrónico.
   * @param {string} [data.rol='cliente'] - Rol dentro del sistema (`cliente`, `empleado`, `admin`).
   * @param {string|null} [data.documento=null] - Documento de identidad opcional.
   * @param {string|null} [data.telefono=null] - Teléfono de contacto opcional.
   * @param {string} [data.estado='Activo'] - Estado operativo inicial del usuario.
   * @returns {Promise<object>} Registro completo del usuario insertado.
   */
  async create({
    nombre,
    nombreNormalizado,
    email,
    rol = 'cliente',
    documento = null,
    telefono = null,
    estado = 'Activo',
  }) {
    // Ejecuta la sentencia INSERT enlazando los 7 atributos de forma segura mediante parámetros posicionales
    const result = await this.db.query(
      `INSERT INTO usuarios (nombre, nombre_normalizado, email, rol, documento, telefono, estado)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [nombre, nombreNormalizado, email, rol, documento, telefono, estado]
    );
    // Devuelve la fila recién persistida con su ID autogenerado y marcas de tiempo
    return result.rows[0];
  }

  /**
   * Actualiza parcialmente los datos de un usuario existente conservando los valores actuales
   * para cualquier propiedad enviada como `null` o `undefined` gracias a `COALESCE`, y refresca `fecha_actualizacion`.
   *
   * Consulta ejecutada: `UPDATE usuarios SET ... fecha_actualizacion = NOW() WHERE id = $8 RETURNING *`
   *
   * @param {number|string} id - Identificador primario del usuario a modificar.
   * @param {object} fields - Campos opcionales a actualizar (`nombre`, `nombreNormalizado`, `email`, `rol`, `documento`, `telefono`, `estado`).
   * @returns {Promise<object|null>} Registro actualizado del usuario o `null` si el `id` no existe.
   */
  async update(
    id,
    { nombre, nombreNormalizado, email, rol, documento, telefono, estado }
  ) {
    // Ejecuta UPDATE parametrizado donde COALESCE mantiene el valor previo de la columna si el parámetro es nulo
    const result = await this.db.query(
      `UPDATE usuarios
       SET nombre = COALESCE($1, nombre),
           nombre_normalizado = COALESCE($2, nombre_normalizado),
           email = COALESCE($3, email),
           rol = COALESCE($4, rol),
           documento = COALESCE($5, documento),
           telefono = COALESCE($6, telefono),
           estado = COALESCE($7, estado),
           fecha_actualizacion = NOW()
       WHERE id = $8
       RETURNING *`,
      [nombre, nombreNormalizado, email, rol, documento, telefono, estado, id]
    );
    // Retorna el usuario modificado o null cuando ningún registro coincidió con el ID indicado
    return result.rows[0] || null;
  }

  /**
   * Elimina físicamente un usuario por su identificador primario devolviendo los datos del registro borrado.
   *
   * Consulta ejecutada: `DELETE FROM usuarios WHERE id = $1 RETURNING *`
   *
   * @param {number|string} id - Identificador primario del usuario a eliminar.
   * @returns {Promise<object|null>} Fila eliminada de la base de datos o `null` si no se encontró.
   */
  async delete(id) {
    // Ejecuta el borrado parametrizado por ID recuperando el registro afectado mediante RETURNING *
    const result = await this.db.query(
      'DELETE FROM usuarios WHERE id = $1 RETURNING *',
      [id]
    );
    // Devuelve los datos del usuario eliminado o null si no existía
    return result.rows[0] || null;
  }
}

// Exporta la clase UserRepository para su registro en el contenedor de dependencias
module.exports = UserRepository;
