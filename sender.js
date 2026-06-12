// sender.js — Envío de mensajes WhatsApp usando Baileys

const config = require('./config');

// Referencia al socket de Baileys (se asigna desde index.js al conectar)
let socketBaileys = null;

// Estado de la conexión
let conectado = false;

// Asigna el socket de Baileys una vez que está conectado
function setSock(sock) {
  socketBaileys = sock;
}

// Actualiza el estado de conexión
function setConectado(estado) {
  conectado = estado;
}

// Devuelve si Baileys está conectado
function estaConectado() {
  return conectado;
}

// Valida que un número de WhatsApp tenga formato correcto
// Debe ser solo dígitos, entre 10 y 15 caracteres
function validarNumero(numero) {
  const limpio = numero.replace(/\D/g, '');
  return limpio.length >= 10 && limpio.length <= 15;
}

// Formatea el número para Baileys: agrega @s.whatsapp.net
function formatearJid(numero) {
  const limpio = numero.replace(/\D/g, '');
  return `${limpio}@s.whatsapp.net`;
}

// Envía un mensaje a un número de WhatsApp
// Tiene 1 reintento si el primer envío falla por timeout
async function sendMessage(numero, mensaje) {
  if (!socketBaileys || !conectado) {
    throw new Error('Baileys no está conectado');
  }

  if (!validarNumero(numero)) {
    throw new Error(`Número de WhatsApp inválido: ${numero}`);
  }

  const jid = formatearJid(numero);
  const payload = { text: mensaje };

  // Primer intento
  try {
    await socketBaileys.sendMessage(jid, payload);
    return;
  } catch (error) {
    // Solo reintentamos si parece un error de timeout o conexión transitoria
    const esTimeout = error.message && (
      error.message.includes('timeout') ||
      error.message.includes('timed out') ||
      error.message.includes('connection')
    );

    if (!esTimeout) {
      throw error; // Error diferente, propagamos directamente
    }

    console.warn(`⚠️  Primer intento fallido para ${numero}, reintentando...`);
  }

  // Segundo intento (único reintento)
  await socketBaileys.sendMessage(jid, payload);
}

module.exports = {
  setSock,
  setConectado,
  estaConectado,
  sendMessage,
};
