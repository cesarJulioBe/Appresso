const pool = require('./src/infrastructure/database/connection');

pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Error de conexión:', err.message);
  } else {
    console.log('✅ Conectado a PostgreSQL. Hora del servidor:', res.rows[0].now);
  }
  pool.end();
});