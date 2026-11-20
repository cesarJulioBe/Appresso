const db = require('../src/infrastructure/database/connection');

async function resetFraudTables() {
  try {
    await db.query('DELETE FROM anomalias');
    await db.query('DELETE FROM transacciones');
    console.log('✅ Tablas "anomalias" y "transacciones" limpiadas correctamente (0 registros).');
    console.log('🚀 El sistema está limpio y listo para recibir el lote de transacciones del profesor.');
  } catch (err) {
    console.error('❌ Error al limpiar tablas de fraude:', err.message);
    process.exitCode = 1;
  } finally {
    await db.close();
  }
}

resetFraudTables();
