// scheduler.js — Lógica del cron: lee Sheet, evalúa condiciones, envía mensajes

const config = require('./config');
const { leerFilas, registrarEnvio } = require('./sheets');
const { sendMessage, estaConectado } = require('./sender');
const { generarMensaje, generarMensajeAdmin } = require('./messages');

// Estado de la última corrida (para el endpoint /status)
const estadoUltimaCorrida = {
  fecha: null,
  mensajesEnviados: 0,
  asesoresPendientes: 0,
  errores: [],
};

// Espera N milisegundos (para el delay entre envíos)
function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Devuelve la diferencia en días entre dos fechas ISO (b - a)
function diasDiferencia(fechaIsoA, fechaIsoB) {
  const msA = new Date(fechaIsoA).getTime();
  const msB = new Date(fechaIsoB).getTime();
  return Math.floor((msB - msA) / (1000 * 60 * 60 * 24));
}

// Devuelve el día del mes actual en la zona horaria configurada (número entero)
function diaDelMesHoy() {
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: config.timezone });
  return parseInt(hoy.split('-')[2], 10);
}

// Evalúa en qué estado de cobro está una fila y qué acción hay que tomar
// Devuelve: { accion: 'mensaje1'|'mensaje2'|'mensaje3'|'escalar'|'skip', razon: string }
function evaluarFila(fila) {
  // Si está pagado, saltear siempre
  if (fila.estado === 'PAGADO') {
    return { accion: 'skip', razon: 'Ya está marcado como PAGADO' };
  }

  // Si está EN_PROCESO, el equipo gestiona manualmente
  if (fila.estado === 'EN_PROCESO') {
    return { accion: 'skip', razon: 'Estado EN_PROCESO, gestión manual activa' };
  }

  const dia = diaDelMesHoy();

  // CASO A: Primer recordatorio
  // Condición: estamos en el día de inicio del recordatorio (día 2 o después) y no se envió aún
  if (!fila.fecha_envio_1) {
    if (dia >= config.diaInicioRecordatorio) {
      return { accion: 'mensaje1', razon: `Día ${dia} del mes — ventana de cobros abierta` };
    }
    return { accion: 'skip', razon: `Día ${dia} del mes — aún no corresponde avisar (inicio el día ${config.diaInicioRecordatorio})` };
  }

  // CASO B: Seguimiento 1
  // Condición: primer mensaje enviado + pasaron X días + no se envió el segundo
  if (!fila.fecha_envio_2) {
    const diasDesdeEnvio1 = diasDiferencia(fila.fecha_envio_1, new Date().toISOString());
    if (diasDesdeEnvio1 >= config.diasEntreSeguimientos) {
      return { accion: 'mensaje2', razon: `${diasDesdeEnvio1} días sin pago desde el primer mensaje` };
    }
    return { accion: 'skip', razon: `Esperando ${config.diasEntreSeguimientos} días entre seguimientos (han pasado ${diasDesdeEnvio1})` };
  }

  // CASO C: Seguimiento 2
  // Condición: segundo mensaje enviado + pasaron X días + no se envió el tercero
  if (!fila.fecha_envio_3) {
    const diasDesdeEnvio2 = diasDiferencia(fila.fecha_envio_2, new Date().toISOString());
    if (diasDesdeEnvio2 >= config.diasEntreSeguimientos) {
      return { accion: 'mensaje3', razon: `${diasDesdeEnvio2} días sin pago desde el segundo seguimiento` };
    }
    return { accion: 'skip', razon: `Esperando ${config.diasEntreSeguimientos} días entre seguimientos (han pasado ${diasDesdeEnvio2})` };
  }

  // CASO D: Se agotaron los seguimientos, escalar al equipo
  return { accion: 'escalar', razon: 'Todos los mensajes enviados sin respuesta de pago' };
}

// Ejecuta una corrida completa del scheduler
async function correrScheduler() {
  console.log(`\n🏃 Corrida iniciada: ${new Date().toISOString()}`);

  // Verificar que Baileys esté conectado antes de hacer cualquier cosa
  if (!estaConectado()) {
    console.error('❌ Baileys no está conectado. Se omite la corrida.');
    estadoUltimaCorrida.fecha = new Date().toISOString();
    estadoUltimaCorrida.mensajesEnviados = 0;
    estadoUltimaCorrida.errores = ['Baileys desconectado'];
    return;
  }

  // Leer la Sheet
  let filas;
  try {
    filas = await leerFilas();
    console.log(`📋 Filas leídas: ${filas.length}`);
  } catch (error) {
    console.error('❌ Error al leer Google Sheets:', error.message);
    estadoUltimaCorrida.fecha = new Date().toISOString();
    estadoUltimaCorrida.errores = [`Error leyendo Sheet: ${error.message}`];
    return;
  }

  // Filtrar solo los pendientes (los PAGADO y EN_PROCESO igual pasan por evaluarFila)
  const pendientes = filas.filter((f) => f.estado !== 'PAGADO');
  console.log(`📌 Asesores pendientes de pago: ${pendientes.length}`);

  let mensajesEnviados = 0;
  const erroresCorrida = [];

  // Procesar cada fila
  for (const fila of filas) {
    const { accion, razon } = evaluarFila(fila);

    if (accion === 'skip') {
      console.log(`⏭️  ${fila.nombre}: omitido — ${razon}`);
      continue;
    }

    if (accion === 'escalar') {
      // Notificar al equipo administrativo
      console.log(`🚨 ${fila.nombre}: escalando al equipo admin`);
      const cantidadEnvios = [fila.fecha_envio_1, fila.fecha_envio_2, fila.fecha_envio_3].filter(Boolean).length;
      const mensajeAdmin = generarMensajeAdmin(fila, cantidadEnvios);

      try {
        await sendMessage(config.numeroAdmin, mensajeAdmin);
        console.log(`✅ Alerta enviada al admin por ${fila.nombre}`);
        mensajesEnviados++;
      } catch (error) {
        console.error(`❌ Error al enviar alerta admin por ${fila.nombre}:`, error.message);
        erroresCorrida.push(`Alerta admin para ${fila.nombre}: ${error.message}`);
      }

      await esperar(config.delayEntreEnvios);
      continue;
    }

    // Determinar qué número de mensaje corresponde
    const numeroMensaje = {
      mensaje1: 1,
      mensaje2: 2,
      mensaje3: 3,
    }[accion];

    // Generar y enviar el mensaje
    let texto;
    try {
      texto = generarMensaje(numeroMensaje, fila);
    } catch (error) {
      console.error(`❌ Error al generar mensaje para ${fila.nombre}:`, error.message);
      erroresCorrida.push(`Generación de mensaje para ${fila.nombre}: ${error.message}`);
      continue;
    }

    try {
      await sendMessage(fila.whatsapp, texto);
      console.log(`✅ Mensaje ${numeroMensaje} enviado a ${fila.nombre} (${fila.whatsapp})`);
      mensajesEnviados++;
    } catch (error) {
      console.error(`❌ Error al enviar mensaje a ${fila.nombre} (${fila.whatsapp}):`, error.message);
      erroresCorrida.push(`Envío a ${fila.nombre}: ${error.message}`);
      // No registrar la fecha si falló el envío
      await esperar(config.delayEntreEnvios);
      continue;
    }

    // Registrar la fecha de envío INMEDIATAMENTE en la Sheet
    try {
      await registrarEnvio(fila._fila, numeroMensaje);
      console.log(`📝 Fecha de envío ${numeroMensaje} registrada para ${fila.nombre}`);
    } catch (error) {
      console.error(`⚠️  Mensaje enviado pero error al registrar fecha para ${fila.nombre}:`, error.message);
      erroresCorrida.push(`Registro de fecha para ${fila.nombre}: ${error.message}`);
    }

    // Esperar entre envíos para evitar ban
    await esperar(config.delayEntreEnvios);
  }

  // Actualizar estado de la última corrida
  estadoUltimaCorrida.fecha = new Date().toISOString();
  estadoUltimaCorrida.mensajesEnviados = mensajesEnviados;
  estadoUltimaCorrida.asesoresPendientes = pendientes.length;
  estadoUltimaCorrida.errores = erroresCorrida;

  if (pendientes.length === 0) {
    console.log('✅ Sin registros pendientes. Corrida finalizada.');
  } else {
    console.log(`\n✅ Corrida finalizada: ${mensajesEnviados} mensajes enviados, ${erroresCorrida.length} errores`);
  }
}

// Devuelve el estado de la última corrida
function getEstadoUltimaCorrida() {
  return estadoUltimaCorrida;
}

module.exports = {
  correrScheduler,
  getEstadoUltimaCorrida,
};
