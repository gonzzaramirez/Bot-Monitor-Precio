# 🤖 Bot Monitor de Precios - Telegram

Este bot desarrollado en Node.js permite monitorear automáticamente los precios de productos (como cerdo y pollo) desde el sitio web de [La Reina Corrientes](https://www.lareinacorrientes.com.ar/) y notifica los cambios a través de un canal o grupo de Telegram.

## 📦 Funcionalidades

- Extrae precios desde la web con `axios` y `cheerio`.
- Detecta aumentos o disminuciones y calcula el porcentaje de cambio.
- Notifica automáticamente los cambios por Telegram.
- Comandos para obtener información manualmente desde Telegram.
- Ejecuta una verificación automática diaria a las 9:00 AM (hora Argentina).

## 🛠️ Instalación

1. Clona el repositorio:
   ```bash
   git clone https://github.com/gonzzaramirez/Bot-Monitor-Precio
   cd bot-monitor-precios
   ```

2. Instala las dependencias:
   ```bash
   npm install
   ```

3. Crea un archivo `.env` con tu token de bot y tu chat ID:
   ```env
   BOT_TOKEN=TU_TOKEN_AQUI
   CHAT_ID=TU_CHAT_ID_AQUI
   ```

4. Ejecuta el bot:
   ```bash
   node bot-monitor-precios.js
   ```

## 🧾 Comandos de Telegram

| Comando            | Descripción                                     |
|--------------------|-------------------------------------------------|
| `/precios`         | Ver precios actuales por categoría              |
| `/verificar`       | Ejecutar monitoreo manual                       |
| `/ultima_ejecucion`| Ver la última ejecución del bot                 |
| `/productos`       | Ver la lista de productos monitoreados          |
| `/categorias`      | Mostrar las categorías monitoreadas             |
| `/status`          | Ver estado del bot y monitoreo                  |
| `/help`            | Mostrar la ayuda con los comandos disponibles   |

## 🕒 Cron programado

El bot ejecuta automáticamente el monitoreo todos los días a las **9:00 AM (hora de Argentina)** utilizando `node-cron`.

## 📁 Archivos importantes

- `precios.json`: guarda los precios históricos para comparación.
- `ultima_ejecucion.json`: almacena la última ejecución del bot.

## 🧰 Stack Tecnológico

- Node.js
- Telegram Bot API (`node-telegram-bot-api`)
- Web scraping con `axios` y `cheerio`
- Programación de tareas con `node-cron`

## ✨ Ejemplo de salida

```
🔔 CAMBIOS DE PRECIOS DETECTADOS

📉 Pechuga de pollo (POLLO)
💰 Antes: $2.350 (kg)
💰 Ahora: $2.100
📊 Cambio: -$250 (-10.64%)

📈 Costilla de cerdo (CERDO)
💰 Antes: $3.200 (kg)
💰 Ahora: $3.500
📊 Cambio: +$300 (+9.38%)
```
