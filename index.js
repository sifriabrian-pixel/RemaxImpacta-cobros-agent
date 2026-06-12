// index.js — Entry point: inicializa Baileys, arranca el scheduler y el servidor HTTP

const {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const cron = require('node-cron');
const express = require('express');
const path = require('path');

const config = require('./config');
const { setSock, setConectado, estaConectado } = require('./sender');
const { correrScheduler, getEstadoUltimaCorrida } = require('./scheduler');
const { leerFilas } = require('./sheets');

// Validar configuración antes de arrancar
config.validar();

// ─────────────────────────────────────────────
// BAILEYS — Conexión WhatsApp
// ─────────────────────────────────────────────

async function conectarWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(config.sessionPath);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'warn' }),
    printQRInTerminal: false, // Lo manejamos manualmente para mostrarlo bien
  });

  // Guardar referencia del socket en sender.js
  setSock(sock);

  // Eventos de conexión
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    // Mostrar QR cuando aparezca (solo en el primer escaneo)
    if (qr) {
      console.log('\n📱 Escaneá este QR con WhatsApp para conectar el agente:\n');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      setConectado(false);
      const codigoError = lastDisconnect?.error?.output?.statusCode;
      const debeReconectar = codigoError !== DisconnectReason.loggedOut;

      if (debeReconectar) {
        console.warn('⚠️  Conexión cerrada, reconectando en 5 segundos...');
        setTimeout(conectarWhatsApp, 5000);
      } else {
        console.error('❌ Sesión cerrada (logout). Eliminá la carpeta de sesión y volvé a escanear el QR.');
      }
    }

    if (connection === 'open') {
      setConectado(true);
      console.log('✅ WhatsApp conectado correctamente.');
    }

    if (connection === 'connecting') {
      console.log('🔄 Conectando a WhatsApp...');
    }
  });

  // Guardar credenciales cuando se actualicen
  sock.ev.on('creds.update', saveCreds);

  return sock;
}

// ─────────────────────────────────────────────
// SCHEDULER — Cron diario
// ─────────────────────────────────────────────

function arrancarScheduler() {
  console.log(`⏰ Scheduler configurado: ${config.cronSchedule} (${config.timezone})`);

  cron.schedule(config.cronSchedule, () => {
    console.log('🕘 Cron disparado, iniciando corrida...');
    correrScheduler().catch((err) => {
      console.error('❌ Error inesperado en el scheduler:', err);
    });
  }, {
    timezone: config.timezone,
  });
}

// ─────────────────────────────────────────────
// SERVIDOR HTTP — Endpoints de control
// ─────────────────────────────────────────────

function arrancarServidor() {
  const app = express();
  app.use(express.json());

  // Middleware de autenticación para endpoints protegidos
  function requireAdminToken(req, res, next) {
    const token = req.headers['x-admin-token'] || req.headers['authorization'];
    if (!token || token !== config.adminToken) {
      return res.status(401).json({ error: 'Token de autorización inválido' });
    }
    next();
  }

  // GET /health — Health check para Railway
  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  // GET /status — Estado del sistema
  app.get('/status', async (req, res) => {
    let asesoresPendientes = null;
    try {
      const filas = await leerFilas();
      asesoresPendientes = filas.filter((f) => f.estado !== 'PAGADO').length;
    } catch (e) {
      // Si falla la lectura, devolvemos null en ese campo
    }

    const ultimaCorrida = getEstadoUltimaCorrida();

    res.json({
      baileys: {
        conectado: estaConectado(),
      },
      scheduler: {
        cronSchedule: config.cronSchedule,
        timezone: config.timezone,
        ultimaCorrida: ultimaCorrida.fecha,
        mensajesEnviados: ultimaCorrida.mensajesEnviados,
        errores: ultimaCorrida.errores,
      },
      sheet: {
        asesoresPendientes,
      },
    });
  });

  // POST /run-now — Ejecución manual protegida con token
  app.post('/run-now', requireAdminToken, (req, res) => {
    console.log('🚀 /run-now ejecutado manualmente');
    // Lanzamos la corrida sin await para no bloquear la respuesta HTTP
    correrScheduler().catch((err) => {
      console.error('❌ Error en corrida manual:', err);
    });
    res.json({ status: 'corrida iniciada', timestamp: new Date().toISOString() });
  });

  app.listen(config.puerto, () => {
    console.log(`🌐 Servidor HTTP escuchando en puerto ${config.puerto}`);
  });
}

// ─────────────────────────────────────────────
// ARRANQUE
// ─────────────────────────────────────────────

async function main() {
  console.log('🏠 RE/MAX Impacta — Agente de Cobros arrancando...');

  try {
    await conectarWhatsApp();
  } catch (error) {
    console.error('❌ Error al inicializar Baileys:', error);
    process.exit(1);
  }

  arrancarScheduler();
  arrancarServidor();
}

main();
