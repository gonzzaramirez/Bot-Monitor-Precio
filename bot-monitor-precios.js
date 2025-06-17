// bot-monitor-precios.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const cheerio = require('cheerio');
const cron = require('node-cron');

// Config
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
if (!BOT_TOKEN || !CHAT_ID) {
  console.error('❌ BOT_TOKEN o CHAT_ID faltante en .env');
  process.exit(1);
}

const URLS = {
  cerdo: 'https://www.lareinacorrientes.com.ar/categoria-producto/carniceria/cerdo/',
  pollo: 'https://www.lareinacorrientes.com.ar/categoria-producto/carniceria/pollo/',
};

const DB_FILE = path.join(__dirname, 'precios.json');
const LAST_RUN_FILE = path.join(__dirname, 'ultima_ejecucion.json');

let preciosAnteriores = {};

if (fs.existsSync(DB_FILE)) {
  try {
    const contenido = fs.readFileSync(DB_FILE, 'utf8').trim();
    preciosAnteriores = contenido ? JSON.parse(contenido) : {};
  } catch (err) {
    console.error('❌ Error al leer precios.json:', err.message);
    preciosAnteriores = {};
  }
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

function escapeHTML(str) {
  return str.replace(/[&<>"']/g, (c) => {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

async function extraerPrecios(url, categoria) {
  try {
    const { data } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const $ = cheerio.load(data);
    const productos = [];

    $('.woocommerce-loop-product__link').each((_, el) => {
      const nombre = $(el).find('.woocommerce-loop-product__title').text().trim();
      const precioTexto = $(el).find('.price').text().trim();
      const precioMatch = precioTexto.replace(/\s+/g, ' ').match(/\$([0-9\.]+,[0-9]{2})/);
      if (!nombre || !precioMatch) return;
      const precio = parseFloat(precioMatch[1].replace(/\./g, '').replace(',', '.'));
      const unidad = precioTexto.includes('kg') ? 'kg' : precioTexto.includes('15kg') ? 'cajón 15kg' : 'unidad';
      productos.push({ nombre: escapeHTML(nombre), precio, unidad, categoria });
    });

    return productos;
  } catch (error) {
    console.error(`❌ Error al extraer precios [${categoria}]:`, error.message);
    return [];
  }
}

function compararPrecios(nuevos, categoria) {
  const cambios = [];
  nuevos.forEach(p => {
    const key = `${categoria}_${p.nombre}`;
    const prev = preciosAnteriores[key];
    if (prev != null && prev !== p.precio) {
      const dif = p.precio - prev;
      const pct = ((dif / prev) * 100).toFixed(2);
      cambios.push({ ...p, precioAnterior: prev, diferencia: dif, porcentaje: pct, tipo: dif > 0 ? 'aumento' : 'disminucion' });
    }
    preciosAnteriores[key] = p.precio;
  });
  return cambios;
}

function formatCambios(cambios) {
  if (!cambios.length) return null;
  let msg = '🔔 <b>CAMBIOS DE PRECIOS DETECTADOS</b>\n\n';
  cambios.forEach(c => {
    const emoji = c.tipo === 'aumento' ? '📈' : '📉';
    const sign = c.diferencia > 0 ? '+' : '';
    msg += `${emoji} <b>${c.nombre}</b> (${c.categoria.toUpperCase()})\n`;
    msg += `💰 Antes: $${c.precioAnterior.toLocaleString('es-AR')} (${c.unidad})\n`;
    msg += `💰 Ahora: $${c.precio.toLocaleString('es-AR')}\n`;
    msg += `📊 Cambio: ${sign}$${Math.abs(c.diferencia).toLocaleString('es-AR')} (${sign}${c.porcentaje}%)\n\n`;
  });
  msg += `⏰ ${new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}`;
  return msg;
}

async function monitorear() {
  console.log('🔍 Iniciando monitoreo...');
  const allCambios = [];
  for (const [cat, url] of Object.entries(URLS)) {
    const productos = await extraerPrecios(url, cat);
    allCambios.push(...compararPrecios(productos, cat));
  }

  fs.writeFileSync(DB_FILE, JSON.stringify(preciosAnteriores, null, 2), 'utf8');
  fs.writeFileSync(LAST_RUN_FILE, JSON.stringify({ ultimaEjecucion: new Date().toISOString() }), 'utf8');

  const msg = formatCambios(allCambios);
  if (msg) {
    await bot.sendMessage(CHAT_ID, msg, { parse_mode: 'HTML' });
    console.log(`✅ ${allCambios.length} cambios notificados`);
  } else {
    console.log('ℹ️ Sin cambios');
  }
}

// COMANDOS TELEGRAM

bot.onText(/\/precios/, async (msg) => {
  const id = msg.chat.id;
  await bot.sendMessage(id, '🔍 Obteniendo precios actuales...');
  try {
    let resp = '📋 <b>PRECIOS ACTUALES</b>\n\n';
    for (const [cat, url] of Object.entries(URLS)) {
      const productos = await extraerPrecios(url, cat);
      resp += `<b>${cat.toUpperCase()}:</b>\n`;
      productos.forEach(p => resp += `• ${p.nombre}: $${p.precio.toLocaleString('es-AR')} (${p.unidad})\n`);
      resp += '\n';
    }
    resp += `⏰ ${new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}`;
    await bot.sendMessage(id, resp, { parse_mode: 'HTML' });
  } catch (e) {
    await bot.sendMessage(id, `❌ Error: ${e.message}`);
  }
});

bot.onText(/\/verificar/, async (msg) => {
  const id = msg.chat.id;
  await bot.sendMessage(id, '🔄 Ejecutando monitoreo manual...');
  try {
    await monitorear();
    await bot.sendMessage(id, '✅ Monitoreo finalizado.');
  } catch (err) {
    await bot.sendMessage(id, `❌ Error en monitoreo: ${err.message}`);
  }
});

bot.onText(/\/ultima_ejecucion/, (msg) => {
  const id = msg.chat.id;
  if (fs.existsSync(LAST_RUN_FILE)) {
    const { ultimaEjecucion } = JSON.parse(fs.readFileSync(LAST_RUN_FILE, 'utf8'));
    const fecha = new Date(ultimaEjecucion).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
    bot.sendMessage(id, `🕒 Última ejecución: ${fecha}`);
  } else {
    bot.sendMessage(id, '❌ Aún no hay registros de ejecución.');
  }
});

bot.onText(/\/productos/, (msg) => {
  const id = msg.chat.id;
  const list = Object.keys(preciosAnteriores).map(key => key.split('_')[1]);
  const uniq = [...new Set(list)];
  bot.sendMessage(id, `📦 Productos monitoreados:\n${uniq.join('\n')}`);
});

bot.onText(/\/categorias/, (msg) => {
  const id = msg.chat.id;
  bot.sendMessage(id, `📂 Categorías:\n${Object.keys(URLS).join('\n')}`);
});

bot.onText(/\/status/, (msg) => {
  const id = msg.chat.id;
  const count = Object.keys(preciosAnteriores).length;
  const sched = 'Diario a las 9:00 AM (America/Argentina/Buenos_Aires)';
  bot.sendMessage(id, `⚙️ Estado:\nProductos monitoreados: ${count}\nMonitoreo programado: ${sched}`);
});

bot.onText(/\/help/, (msg) => {
  const id = msg.chat.id;
  const txt = `🤖 <b>Comandos disponibles:</b>\n
/precios – Ver precios actuales\n/verificar – Ejecutar monitoreo manual\n/ultima_ejecucion – Última ejecución automática/manual\n/productos – Listar productos monitoreados\n/categorias – Listar categorías disponibles\n/status – Estado general del bot\n/help – Mostrar esta ayuda\n
⏰ Monitoreo automático: todos los días a las 9:00 AM.`;
  bot.sendMessage(id, txt, { parse_mode: 'HTML' });
});

cron.schedule('0 9 * * *', () => {
  console.log('⏰ Ejecución programada');
  monitorear();
}, { timezone: 'America/Argentina/Buenos_Aires' });

async function init() {
  console.log('🚀 Bot iniciado');
  await monitorear();
}
init();
