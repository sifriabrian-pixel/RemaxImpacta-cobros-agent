// sheets.js — Lectura y escritura con Google Sheets API

const { google } = require('googleapis');
const config = require('./config');

// Nombre de la hoja dentro del Google Sheet
const NOMBRE_HOJA = config.sheetNombre;

// Columnas de la Sheet (en orden, corresponden a las columnas A, B, C, ...)
// NOTA: sin columna link_pago — el pago es por transferencia bancaria
const COLUMNAS = [
  'nombre',           // A
  'whatsapp',         // B
  'monto',            // C
  'concepto',         // D
  'estado',           // E
  'fecha_envio_1',    // F
  'fecha_envio_2',    // G
  'fecha_envio_3',    // H
  'observaciones',    // I
];

// Mapeo de nombre de columna a letra de la hoja (para escritura)
const LETRA_COLUMNA = {
  fecha_envio_1: 'F',
  fecha_envio_2: 'G',
  fecha_envio_3: 'H',
};

// Crea el cliente autenticado de Google Sheets
function crearCliente() {
  const credenciales = JSON.parse(config.serviceAccountJson);

  const auth = new google.auth.GoogleAuth({
    credentials: credenciales,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return google.sheets({ version: 'v4', auth });
}

// Lee todas las filas de la Sheet y las devuelve como array de objetos
// La primera fila se usa como encabezado (se ignora)
async function leerFilas() {
  const sheets = crearCliente();

  const respuesta = await sheets.spreadsheets.values.get({
    spreadsheetId: config.sheetId,
    range: `${NOMBRE_HOJA}!A:I`,
  });

  const filas = respuesta.data.values || [];

  if (filas.length <= 1) {
    // Sin datos o solo encabezado
    return [];
  }

  // Convertir cada fila a objeto usando los nombres de columna
  // Empezamos desde la fila 2 (índice 1) para saltear el encabezado
  return filas.slice(1).map((fila, indice) => {
    const objeto = { _fila: indice + 2 }; // +2 porque la Sheet empieza en 1 y tiene encabezado
    COLUMNAS.forEach((columna, i) => {
      objeto[columna] = fila[i] || '';
    });
    return objeto;
  });
}

// Escribe la fecha de envío en la columna correspondiente para una fila específica
// numeroEnvio: 1, 2 o 3
// numeroFila: número de fila real en la Sheet (ej: 2, 3, 4...)
async function registrarEnvio(numeroFila, numeroEnvio) {
  const columna = LETRA_COLUMNA[`fecha_envio_${numeroEnvio}`];
  if (!columna) {
    throw new Error(`Número de envío inválido: ${numeroEnvio}`);
  }

  const sheets = crearCliente();
  const ahora = new Date().toISOString();

  await sheets.spreadsheets.values.update({
    spreadsheetId: config.sheetId,
    range: `${NOMBRE_HOJA}!${columna}${numeroFila}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [[ahora]],
    },
  });
}

module.exports = {
  leerFilas,
  registrarEnvio,
};
