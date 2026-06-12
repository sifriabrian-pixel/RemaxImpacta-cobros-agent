// config.js — Lee variables de entorno y valida que estén presentes al arrancar

require('dotenv').config();

// Variables requeridas para que el sistema funcione
const REQUERIDAS = [
  'GOOGLE_SHEET_ID',
  'GOOGLE_SERVICE_ACCOUNT_JSON',
  'NUMERO_ADMIN',
  'ADMIN_TOKEN',
];

// Verificar que todas las variables requeridas estén presentes
function validarConfig() {
  const faltantes = REQUERIDAS.filter((clave) => !process.env[clave]);

  if (faltantes.length > 0) {
    console.error('❌ ERROR: Faltan las siguientes variables de entorno:');
    faltantes.forEach((clave) => console.error(`   - ${clave}`));
    console.error('Completá el archivo .env antes de arrancar.');
    process.exit(1);
  }

  // Verificar que GOOGLE_SERVICE_ACCOUNT_JSON sea JSON válido
  try {
    JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  } catch (e) {
    console.error('❌ ERROR: GOOGLE_SERVICE_ACCOUNT_JSON no es un JSON válido.');
    console.error('Asegurate de pegar el JSON completo en una sola línea.');
    process.exit(1);
  }
}

module.exports = {
  // Google Sheets
  sheetId: process.env.GOOGLE_SHEET_ID,
  sheetNombre: 'Cobros',
  serviceAccountJson: process.env.GOOGLE_SERVICE_ACCOUNT_JSON,

  // WhatsApp
  numeroAdmin: process.env.NUMERO_ADMIN,

  // Lógica de cobros — fecha fija: vencimiento el día 5, primer aviso el día 2
  diaVencimiento: parseInt(process.env.DIA_VENCIMIENTO || '5', 10),
  diaInicioRecordatorio: parseInt(process.env.DIA_INICIO_RECORDATORIO || '2', 10),
  diasEntreSeguimientos: parseInt(process.env.DIAS_ENTRE_SEGUIMIENTOS || '5', 10),

  // Datos bancarios para transferencia (se muestran en todos los mensajes)
  datosBancarios: process.env.DATOS_BANCARIOS || 'PENDIENTE — completar con datos bancarios',

  // Baileys
  sessionPath: process.env.RAILWAY_VOLUME_MOUNT_PATH || './sessions',

  // Scheduler
  cronSchedule: process.env.CRON_SCHEDULE || '0 9 * * 1-5',
  timezone: process.env.TIMEZONE || 'America/Guayaquil',

  // Envíos
  delayEntreEnvios: 5000, // 5 segundos entre mensajes para evitar ban

  // Servidor HTTP
  puerto: parseInt(process.env.PORT || '3000', 10),
  adminToken: process.env.ADMIN_TOKEN,

  // Función de validación
  validar: validarConfig,
};
