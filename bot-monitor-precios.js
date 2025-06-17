// bot-monitor-precios.js
// Monitor de precios de cerdo y pollo con notificaciones en Telegram

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const cheerio = require('cheerio');
const cron = require('node-cron');

// Cargar variables de entorno desde .env
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
if (!BOT_TOKEN || !CHAT_ID) {
  console.error('⚠️ Configuración faltante: BOT_TOKEN o CHAT_ID no definido en .env');
  process.exit(1);
}

// URLs a monitorear
const URLS = {
  cerdo: 'https://www.lareinacorrientes.com.ar/categoria-producto/carniceria/cerdo/',
  pollo: 'https://www.lareinacorrientes.com.ar/categoria-producto/carniceria/pollo/'
};

// Archivo para persistir precios anteriores
const DB_FILE = path.join(__dirname, 'precios.json');
let preciosAnteriores = {};

// Cargar precios previos si existe y está bien formateado
if (fs.existsSync(DB_FILE)) {
  try {
    const contenido = fs.readFileSync(DB_FILE, 'utf8').trim();
    if (contenido) {
      preciosAnteriores = JSON.parse(contenido);
    } else {
      preciosAnteriores = {};
    }
  } catch (err) {
    console.error('❌ Error al leer precios.json, inicializando base vacía:', err.message);
    preciosAnteriores = {};
  }
}

// Crear instancia de bot (modo polling)
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Extraer precios desde la página
async function extraerPrecios(url, categoria) {
  try {
    const { data } = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const $ = cheerio.load(data);
    const productos = [];

    // Selector más específico para items de producto
    $('.woocommerce-loop-product__link').each((_, el) => {
      const nombre = $(el).find('.woocommerce-loop-product__title').text().trim();
      const precioTexto = $(el).find('.price').text().trim();
      const precioMatch = precioTexto.replace(/\s+/g, ' ').match(/\$([0-9\.]+,[0-9]{2})/);
      if (!nombre || !precioMatch) return;
      const precio = parseFloat(precioMatch[1].replace(/\./g, '').replace(',', '.'));
      const unidad = precioTexto.includes('kg') ? 'kg' : precioTexto.includes('15kg') ? 'cajón 15kg' : 'unidad';
      productos.push({ nombre, precio, unidad, categoria });
    });

    return productos;
  } catch (error) {
    console.error(`❌ Error al extraer precios [${categoria}]:`, error.message);
    return [];
  }
}

// Comparar precios y detectar cambios
function compararPrecios(nuevos, categoria) {
  const cambios = [];
  nuevos.forEach(p => {
    const key = `${categoria}_${p.nombre}`;
    const prev = preciosAnteriores[key];
    if (prev != null && prev !== p.precio) {
      const dif = p.precio - prev;
      const pct = ((dif / prev) * 100).toFixed(2);
      cambios.push({
        nombre: p.nombre,
        categoria,
        precioAnterior: prev,
        precioActual: p.precio,
        diferencia: dif,
        porcentaje: pct,
        unidad: p.unidad,
        tipo: dif > 0 ? 'aumento' : 'disminucion'
      });
    }
    preciosAnteriores[key] = p.precio;
  });
  return cambios;
}

// Formatear mensaje de cambios
function formatCambios(cambios) {
  if (!cambios.length) return null;
  let msg = '🔔 *CAMBIOS DE PRECIOS DETECTADOS*\n\n';
  cambios.forEach(c => {
    const emoji = c.tipo === 'aumento' ? '📈' : '📉';
    const sign = c.diferencia > 0 ? '+' : '';
    msg += `${emoji} *${c.nombre}* (${c.categoria.toUpperCase()})\n`;
    msg += `💰 Antes: $${c.precioAnterior.toLocaleString('es-AR')} (${c.unidad})\n`;
    msg += `💰 Ahora: $${c.precioActual.toLocaleString('es-AR')}\n`;
    msg += `📊 Cambio: ${sign}$${Math.abs(c.diferencia).toLocaleString('es-AR')} (${sign}${c.porcentaje}%)\n\n`;
  });
  msg += `⏰ ${new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}`;
  return msg;
}

// Función principal de monitoreo
async function monitorear() {
  console.log('🔍 Iniciando monitoreo...');
  const allCambios = [];
  for (const [cat, url] of Object.entries(URLS)) {
    const productos = await extraerPrecios(url, cat);
    allCambios.push(...compararPrecios(productos, cat));
  }
  // Guardar DB
  fs.writeFileSync(DB_FILE, JSON.stringify(preciosAnteriores, null, 2), 'utf8');

  const msg = formatCambios(allCambios);
  if (msg) {
    await bot.sendMessage(CHAT_ID, msg, { parse_mode: 'Markdown' });
    console.log(`✅ ${allCambios.length} cambios notificados`);
  } else {
    console.log('ℹ️ Sin cambios');
  }
}

// Comando /precios para precios actuales
bot.onText(/\/precios/, async (msg) => {
  const id = msg.chat.id;
  await bot.sendMessage(id, '🔍 Obteniendo precios actuales...');
  try {
    let resp = '📋 *PRECIOS ACTUALES*\n\n';
    for (const [cat, url] of Object.entries(URLS)) {
      const productos = await extraerPrecios(url, cat);
      resp += `*${cat.toUpperCase()}:*\n`;
      productos.forEach(p => {
        resp += `• ${p.nombre}: $${p.precio.toLocaleString('es-AR')} (${p.unidad})\n`;
      });
      resp += '\n';
    }
    resp += `⏰ ${new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}`;
    await bot.sendMessage(id, resp, { parse_mode: 'Markdown' });
  } catch (e) {
    await bot.sendMessage(id, `❌ Error: ${e.message}`);
  }
});

// Comando /help
bot.onText(/\/help/, (msg) => {
  const id = msg.chat.id;
  const txt = `🤖 *Monitor de Precios*\n\n/comandos disponibles:\n/precios - precios actuales\n/help - esta ayuda\n\n⏰ Monitoreo diario a las 9:00 AM`;
  bot.sendMessage(id, txt, { parse_mode: 'Markdown' });
});

// Cron diario a las 9:00 AM
cron.schedule('0 9 * * *', () => {
  console.log('⏰ Ejecución programada');
  monitorear();
}, { timezone: 'America/Argentina/Buenos_Aires' });

// Inicialización
(async function init() {
  console.log('🚀 Bot iniciado');
  // Primer monitoreo al inicio
  await monitorear();
})();
