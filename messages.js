// messages.js — Templates de mensajes con función de interpolación de variables

const config = require('./config');

// Reemplaza [VARIABLE] por el valor correspondiente en el objeto de datos
function interpolar(template, datos) {
  return template.replace(/\[(\w+)\]/g, (match, clave) => {
    return datos[clave] !== undefined ? datos[clave] : match;
  });
}

// MENSAJE 1 — Primer recordatorio (3 días antes del vencimiento)
const TEMPLATE_MENSAJE_1 = `Estimado/a [NOMBRE],

Le recordamos que el pago de *[CONCEPTO]* por *[MONTO]* tiene como fecha de vencimiento el *5 de [MES_TEXTO]*.

Para realizar su transferencia, por favor utilice los siguientes datos bancarios:

[DATOS_BANCARIOS]

Para cualquier consulta, no dude en responder este mensaje.

RE/MAX Impacta 🏠`;

// MENSAJE 2 — Seguimiento 1 (5 días después sin pago registrado)
const TEMPLATE_MENSAJE_2 = `Estimado/a [NOMBRE],

Le escribimos nuevamente porque aún no hemos registrado su pago de *[CONCEPTO]* por *[MONTO]*.

Si ya realizó la transferencia, le pedimos que confirme por este medio para actualizar nuestros registros.

Si tiene algún inconveniente, responda este mensaje y con gusto le ayudamos.

Datos bancarios:
[DATOS_BANCARIOS]

RE/MAX Impacta 🏠`;

// MENSAJE 3 — Seguimiento 2 (tono más directo, formal)
const TEMPLATE_MENSAJE_3 = `Estimado/a [NOMBRE],

Le enviamos este recordatorio porque el pago de *[CONCEPTO]* por *[MONTO]* se encuentra pendiente de registro.

Es importante regularizar su situación para continuar operando con normalidad.

Si ya realizó el pago, le pedimos que responda este mensaje adjuntando el comprobante o confirmando la transferencia para que podamos verificarlo.

Datos bancarios:
[DATOS_BANCARIOS]

RE/MAX Impacta`;

// MENSAJE ADMIN — Alerta al equipo cuando se agotaron los seguimientos
const TEMPLATE_MENSAJE_ADMIN = `⚠️ *Alerta de cobro pendiente*

El asesor *[NOMBRE]* ([WHATSAPP]) no ha registrado pago de *[CONCEPTO]* por *[MONTO]*.
Vencimiento: 5 de [MES_TEXTO]
Seguimientos enviados: [CANTIDAD_ENVIOS]

Se requiere gestión manual.`;

// Devuelve el nombre del mes en español a partir de un número de mes (1-12)
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

function nombreMes(numeroMes) {
  return MESES[numeroMes - 1] || '';
}

// Genera el texto del mensaje según el número de mensaje (1, 2 o 3)
function generarMensaje(numeroMensaje, fila) {
  // Obtener el mes actual para mostrar en el mensaje
  const ahora = new Date();
  const mesActual = parseInt(
    ahora.toLocaleDateString('en-CA', { timeZone: config.timezone }).split('-')[1],
    10,
  );

  const datos = {
    NOMBRE: fila.nombre,
    CONCEPTO: fila.concepto,
    MONTO: fila.monto,
    MES_TEXTO: nombreMes(mesActual),
    DATOS_BANCARIOS: config.datosBancarios,
    WHATSAPP: fila.whatsapp,
  };

  let template;
  switch (numeroMensaje) {
    case 1:
      template = TEMPLATE_MENSAJE_1;
      break;
    case 2:
      template = TEMPLATE_MENSAJE_2;
      break;
    case 3:
      template = TEMPLATE_MENSAJE_3;
      break;
    default:
      throw new Error(`Número de mensaje inválido: ${numeroMensaje}`);
  }

  return interpolar(template, datos);
}

// Genera el mensaje de alerta para el equipo administrativo
function generarMensajeAdmin(fila, cantidadEnvios) {
  const ahora = new Date();
  const mesActual = parseInt(
    ahora.toLocaleDateString('en-CA', { timeZone: config.timezone }).split('-')[1],
    10,
  );

  const datos = {
    NOMBRE: fila.nombre,
    WHATSAPP: fila.whatsapp,
    CONCEPTO: fila.concepto,
    MONTO: fila.monto,
    MES_TEXTO: nombreMes(mesActual),
    CANTIDAD_ENVIOS: String(cantidadEnvios),
  };

  return interpolar(TEMPLATE_MENSAJE_ADMIN, datos);
}

module.exports = {
  generarMensaje,
  generarMensajeAdmin,
};
