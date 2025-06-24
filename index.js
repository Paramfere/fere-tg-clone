const { Telegraf } = require("telegraf");
const rateLimit = require("telegraf-ratelimit");
require('dotenv').config();
const { askFerePro } = require('./fereClient');
const cache = require('./redis');
const crypto = require('crypto');
const axios = require('axios');
const { extractUserFacingAnswer, prettifyAnswer, parseKPIs, formatTableForTelegram, formatYieldTable, formatSimpleCoinTable, formatFullCoinTable, toHtmlDetails } = require('./utils');

console.log('Loaded BOT_TOKEN:', (process.env.BOT_TOKEN || '').slice(0, 5) + '...' + (process.env.BOT_TOKEN || '').slice(-5));

if (!process.env.BOT_TOKEN) {
  throw new Error('BOT_TOKEN must be set in your .env file');
}
const bot = new Telegraf(process.env.BOT_TOKEN);

// Rate limiting middleware
bot.use(rateLimit({ window: 3000, limit: 5 }));

bot.start((ctx) =>
  ctx.reply("🔥 Hey! Send any crypto research prompt.")
);

bot.help((ctx) =>
  ctx.reply("Send any crypto research prompt and I'll give you a quick summary, chart, and deep link. Try asking about a token, strategy, or DeFi protocol!")
);

bot.command("about", (ctx) =>
  ctx.reply("Fere Bot: Instant crypto research powered by fere.ai. Built with Telegraf.\n\nhttps://fere.ai")
);

// Helper to extract only the user-facing answer from Fere Pro output
function extractUserFacingAnswer(answer) {
  if (!answer) return '';
  // Split by lines of dashes (internal logs are separated by '-----')
  const parts = answer.split(/[-]{5,}/);
  // Find the last part that contains '###' (user-facing markdown)
  for (let i = parts.length - 1; i >= 0; i--) {
    if (parts[i].trim().startsWith('###')) {
      return parts[i].trim();
    }
  }
  // Fallback: return the last part, or the whole answer
  return parts[parts.length - 1].trim() || answer.trim();
}

// Helper to prettify the extracted answer with markdown and emojis
function prettifyAnswer(answer) {
  if (!answer) return '';
  let pretty = answer;

  // Add emojis for common headings and stats
  pretty = pretty.replace(/(?<=\n|^)###/g, '\n\n🚦'); // Headings
  pretty = pretty.replace(/Profit\/Loss Percentage:/gi, '📊 Profit/Loss %:');
  pretty = pretty.replace(/Profit\/Loss:/gi, '💸 Profit/Loss:');
  pretty = pretty.replace(/Initial Investment:/gi, '💵 Initial Investment:');
  pretty = pretty.replace(/Final Amount:/gi, '💰 Final Amount:');
  pretty = pretty.replace(/Price Information:/gi, '💹 Price Info:');
  pretty = pretty.replace(/SMA Signals:/gi, '📊 SMA Signals:');
  pretty = pretty.replace(/Current Price:/gi, '💲 Current Price:');
  pretty = pretty.replace(/Market Cap:/gi, '💰 Market Cap:');
  pretty = pretty.replace(/Sentiment:/gi, '🟢 Sentiment:');
  pretty = pretty.replace(/Summary/gi, '📝 Summary');
  pretty = pretty.replace(/Analysis Period:/gi, '📅 Period:');
  pretty = pretty.replace(/Start Date:/gi, '  - Start:');
  pretty = pretty.replace(/End Date:/gi, '  - End:');
  pretty = pretty.replace(/Duration:/gi, '  - Duration:');
  pretty = pretty.replace(/Initial Price:/gi, '  - Start:');
  pretty = pretty.replace(/Final Price:/gi, '  - End:');
  pretty = pretty.replace(/Neutral Signals:/gi, '  - Neutral:');
  pretty = pretty.replace(/Buy Signals:/gi, '  - Buy:');

  // Add extra spacing for readability
  pretty = pretty.replace(/\n{2,}/g, '\n\n');

  return pretty.trim();
}

// Helper to parse KPIs from the prettified answer for the inline card
function parseKPIs(prettyAnswer, query = '') {
  // Try to extract a relevant title based on the query and content
  let title = 'Crypto Research';
  
  // Check if it's a price query
  if (query.toLowerCase().includes('price')) {
    const priceMatch = prettyAnswer.match(/current price.*?(\$[\d,\.]+)/i);
    if (priceMatch) {
      const token = query.split(' ')[0].toUpperCase();
      title = `💰 ${token} Price: ${priceMatch[1]}`;
    } else {
      title = `💰 ${query.charAt(0).toUpperCase() + query.slice(1)}`;
    }
  }
  // Check if it's about top gainers/losers
  else if (query.toLowerCase().includes('top') && query.toLowerCase().includes('gainers')) {
    title = '📈 Top Gainers (24h)';
  }
  else if (query.toLowerCase().includes('top') && query.toLowerCase().includes('losers')) {
    title = '📉 Top Losers (24h)';
  }
  // Check if it's about a specific token
  else if (query.toLowerCase().match(/\b(btc|eth|sol|ada|dot|link|uni|aave|comp|mkr|sushi|yfi|crv|bal|snx|ren|zrx|knc|band|oxt|nrg|storj|man|bat|zec|dash|ltc|bch|etc|xrp|trx|vet|matic|avax|atom|near|ftm|algo|hbar|icp|fil)\b/)) {
    const token = query.toLowerCase().match(/\b(btc|eth|sol|ada|dot|link|uni|aave|comp|mkr|sushi|yfi|crv|bal|snx|ren|zrx|knc|band|oxt|nrg|storj|man|bat|zec|dash|ltc|bch|etc|xrp|trx|vet|matic|avax|atom|near|ftm|algo|hbar|icp|fil)\b/)[0].toUpperCase();
    title = `🪙 ${token} Analysis`;
  }
  // Check if it's about market cap
  else if (query.toLowerCase().includes('market cap') || query.toLowerCase().includes('mcap')) {
    title = '💰 Market Cap Analysis';
  }
  // Check if it's about volume
  else if (query.toLowerCase().includes('volume')) {
    title = '📊 Volume Analysis';
  }
  // Check if it's about sentiment
  else if (query.toLowerCase().includes('sentiment')) {
    title = '😊 Sentiment Analysis';
  }
  // Check if it's about technical analysis
  else if (query.toLowerCase().includes('technical') || query.toLowerCase().includes('ta') || query.toLowerCase().includes('chart')) {
    title = '📈 Technical Analysis';
  }
  // Check if it's about fundamentals
  else if (query.toLowerCase().includes('fundamental') || query.toLowerCase().includes('fundamentals')) {
    title = '📋 Fundamental Analysis';
  }
  // Check if it's about news
  else if (query.toLowerCase().includes('news')) {
    title = '📰 Latest News';
  }
  // Check if it's about trends
  else if (query.toLowerCase().includes('trend') || query.toLowerCase().includes('trending')) {
    title = '📈 Market Trends';
  }
  // Default based on content
  else {
    // Try to extract key stats using regex
    const titleMatch = prettyAnswer.match(/([A-Z]+).*SMA.*([\-\+]?\d+\.?\d*) ?%/i);
    if (titleMatch) {
      title = `${titleMatch[1]} 20-Day SMA: ${titleMatch[2]}% ${parseFloat(titleMatch[2]) < 0 ? '⛔' : '✅'}`;
    } else {
      // Try to extract any token name from the content
      const tokenMatch = prettyAnswer.match(/\b([A-Z]{2,10})\s*\([A-Z]{2,10}\)/);
      if (tokenMatch) {
        title = `🪙 ${tokenMatch[1]} Research`;
      } else {
        title = `🔍 ${query.charAt(0).toUpperCase() + query.slice(1)}`;
      }
    }
  }

  // Extract description from content
  let description = '';
  
  // Try to extract price info
  const priceMatch = prettyAnswer.match(/current price.*?(\$[\d,\.]+)/i);
  if (priceMatch) {
    description += `💲 ${priceMatch[1]} `;
  }
  
  // Try to extract market cap
  const mcapMatch = prettyAnswer.match(/market cap.*?(\$[\d,\.]+)/i);
  if (mcapMatch) {
    description += `• 💰 ${mcapMatch[1]} `;
  }
  
  // Try to extract 24h change
  const changeMatch = prettyAnswer.match(/([\-\+]?\d+\.?\d*)%/);
  if (changeMatch) {
    const change = changeMatch[1];
    const emoji = parseFloat(change) >= 0 ? '📈' : '📉';
    description += `• ${emoji} ${change}%`;
  }
  
  // If no specific data found, use a generic description
  if (!description) {
    description = 'Crypto research result';
  }

  return { title: title.slice(0, 64), description: description.slice(0, 256) };
}

function formatTableForTelegram(tableText) {
  // Split into lines and filter only table rows
  const lines = tableText
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('|'));

  // Split each line into columns
  const rows = lines.map(line =>
    line
      .split('|')
      .map(col => col.trim())
      .filter(Boolean)
  );

  // Calculate max width for each column
  const colWidths = [];
  rows.forEach(row => {
    row.forEach((col, i) => {
      colWidths[i] = Math.max(colWidths[i] || 0, col.length);
    });
  });

  // Pad each column for alignment
  const formattedRows = rows.map(row =>
    row.map((col, i) => col.padEnd(colWidths[i])).join('  ')
  );

  // Join rows and wrap in <pre> tags
  return `<pre>${formattedRows.join('\n')}</pre>`;
}

function formatYieldTable(tableText, title = 'Top Yield-Bearing Tokens', query = '') {
  const lines = tableText.split('\n').filter(line => line.trim().startsWith('|'));
  
  // Check if this is a 7-column table (with Description)
  const hasDescription = lines.length > 0 && lines[0].split('|').length >= 7;
  
  let legend = '';
  if (hasDescription) {
    legend = '<i>24h & 7d Price Changes = Percentage changes over the last 24 hours and 7 days</i>\n\n';
  } else {
    legend = '<i>1Y Price Change = Percentage change in price over the last year</i>\n\n';
  }
  
  let result = `<b>${title}</b>\n` + legend + '\n';
  let count = 1;
  lines.forEach(line => {
    const cols = line.split('|').map(c => c.trim());
    if (cols.length >= 6 && cols[1] && cols[2]) {
      const tokenName = cols[1];
      const tokenSymbol = cols[2];
      const tokenLink = `https://coingecko.com/en/coins/${tokenName.toLowerCase().replace(/\s+/g, '-')}`;
      result += `${count}. <b><a href="${tokenLink}">${tokenName} (${tokenSymbol})</a></b>\n`;
      result += `   Price: <b>${cols[3]}</b> | MCap: <b>${cols[4]}</b>\n`;
      
      if (hasDescription) {
        result += `   24h Change: <b>${cols[5]}</b> | 7d Change: <b>${cols[6]}</b>\n`;
        if (cols.length >= 8 && cols[7]) result += `   <i>${cols[7]}</i>\n`;
      } else {
        result += `   1Y Price Change: <b>${cols[5]}</b>\n`;
        if (cols.length >= 7 && cols[6]) result += `   <i>${cols[6]}</i>\n`;
      }
      
      result += '\n';
      count++;
    }
  });
  return result.trim();
}

function formatSimpleCoinTable(tableText, title = 'Top Coins') {
  const lines = tableText.split('\n').filter(line => line.trim().startsWith('|'));
  let result = `<b>${title}</b>\n\n`;
  let count = 1;
  lines.forEach(line => {
    const cols = line.split('|').map(c => c.trim());
    if (cols.length >= 8 && cols[1] && cols[2]) {
      const tokenName = cols[1];
      const tokenSymbol = cols[2];
      const tokenLink = `https://coingecko.com/en/coins/${tokenName.toLowerCase().replace(/\s+/g, '-')}`;
      result += `${count}. <b><a href="${tokenLink}">${tokenName} (${tokenSymbol})</a></b>\n`;
      result += `   Price: <b>${cols[3]}</b> | MCap: <b>${cols[4]}</b> | Change: <b>${cols[5]}</b>\n`;
      result += `   Supply: <b>${cols[6]}</b> | Chain: <b>${cols[7]}</b>\n\n`;
      count++;
    }
  });
  return result.trim();
}

function formatHybridCoinTable(tableText, title = 'Top Movers') {
  const lines = tableText.split('\n').filter(line => line.trim().startsWith('|'));
  let result = `<b>${title}</b>\n\n`;
  let count = 1;
  lines.forEach(line => {
    const cols = line.split('|').map(c => c.trim());
    if (cols.length >= 7 && cols[1] && cols[2]) {
      const tokenName = cols[1];
      const tokenSymbol = cols[2];
      const tokenLink = `https://coingecko.com/en/coins/${tokenName.toLowerCase().replace(/\s+/g, '-')}`;
      result += `${count}. <b><a href="${tokenLink}">${tokenName} (${tokenSymbol})</a></b>\n`;
      result += `   Price: <b>${cols[3]}</b> | MCap: <b>${cols[4]}</b> | Change: <b>${cols[5]}</b>\n`;
      if (cols[6] && cols[6] !== '-') result += `   ${cols[6]}\n`;
      result += '\n';
      count++;
    }
  });
  return result.trim();
}

function formatMultiChangeCoinTable(tableText, title = 'Top Gainers (Last 3 Months)') {
  const lines = tableText.split('\n').filter(line => line.trim().startsWith('|'));
  let result = `<b>${title}</b>\n\n`;
  let count = 1;
  lines.forEach(line => {
    const cols = line.split('|').map(c => c.trim());
    if (cols.length >= 8 && cols[1] && cols[2]) {
      const tokenName = cols[1];
      const tokenSymbol = cols[2];
      const tokenLink = `https://coingecko.com/en/coins/${tokenName.toLowerCase().replace(/\s+/g, '-')}`;
      result += `${count}. <b><a href="${tokenLink}">${tokenName} (${tokenSymbol})</a></b>\n`;
      result += `   Price: <b>${cols[3]}</b> | MCap: <b>${cols[4]}</b>\n`;
      result += `   Change: <b>${cols[5]}</b> (24h), <b>${cols[6]}</b> (3mo)\n`;
      if (cols[7] && cols[7] !== '-') result += `   ${cols[7]}\n`;
      result += '\n';
      count++;
    }
  });
  return result.trim();
}

bot.on("text", async (ctx) => {
  const prompt = ctx.message.text;
  const key = `last:${ctx.from.id}`;
  console.log({ user: ctx.from.id, prompt });
  // Send a quick placeholder
  const workingMsg = await ctx.reply("⏳ Working on your request...");
  try {
    const res = await askFerePro(prompt);
    const userAnswer = extractUserFacingAnswer(res.answer);
    const prettyAnswer = prettifyAnswer(userAnswer);
    const formattedAnswer = toHtmlDetails(prettyAnswer, prompt);
    await cache.set(key, JSON.stringify({ q: prompt }), 86400);
    // Split long answers into multiple messages (Telegram limit: 4096 chars)
    const chunks = [];
    let text = formattedAnswer;
    while (text.length > 0) {
      chunks.push(text.slice(0, 4000));
      text = text.slice(4000);
    }
    // Edit the placeholder with the first chunk and include the buttons
    try {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        workingMsg.message_id,
        undefined,
        chunks[0],
        {
          parse_mode: 'HTML',
          reply_markup: actionKeyboard(ctx, prompt)
        }
      );
    } catch (err) {
      console.error('Telegram send error:', err);
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        workingMsg.message_id,
        undefined,
        prettyAnswer || "No answer returned."
      );
    }
    // Send any remaining chunks as new messages (no buttons)
    for (let i = 1; i < chunks.length; i++) {
      await ctx.reply(chunks[i], { parse_mode: 'HTML' });
    }
    if (res.chart_url) {
      await ctx.replyWithPhoto(res.chart_url);
    }
    if (res.deep_link) {
      await ctx.reply(`🔗 <a href="${res.deep_link}">View detailed analysis on Fereai.xyz</a>`, { parse_mode: 'HTML' });
    }
  } catch (err) {
    console.error('Fere Pro error:', err);
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      workingMsg.message_id,
      undefined,
      "❌ Sorry, there was an error contacting Fere Pro. Please try again."
    );
  }
});

// Handle copy answer callback
bot.action('copy_answer', async (ctx) => {
  try {
    const messageText = ctx.callbackQuery.message.text;
    // Create a shareable version without HTML tags
    const plainText = messageText
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
    
    await ctx.answerCbQuery('📋 Answer copied! You can now paste it anywhere.');
    
    // Send the plain text version for easy copying
    await ctx.reply(`📋 **Copy this answer:**\n\n\`\`\`\n${plainText}\n\`\`\``, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('Copy answer error:', err);
    await ctx.answerCbQuery('❌ Error copying answer');
  }
});

bot.on('inline_query', async (ctx) => {
  console.time('inline_query_total');
  console.log('Received inline query:', ctx.inlineQuery.query);
  const q = ctx.inlineQuery.query.trim();
  if (!q) {
    // If query is empty, show a prompt card
    return ctx.answerInlineQuery([
      {
        type: 'article',
        id: 'empty',
        title: 'Type a crypto question…',
        description: 'Try: eth price, top gainers, BTC chart',
        input_message_content: { message_text: 'Ask me about any crypto, token, or strategy!' }
      }
    ], { cache_time: 1 });
  }

  const cacheKey = `inline:${q}`;
  let cached;
  console.time('inline_query_cache_get');
  try {
    cached = await cache.get(cacheKey);
  } catch (err) {
    console.error('Redis error:', err);
  }
  console.timeEnd('inline_query_cache_get');

  if (cached) {
    console.log('Cache hit for:', cacheKey);
    const results = JSON.parse(cached);
    console.log('Sending inline results (from cache):', JSON.stringify(results, null, 2));
    console.timeEnd('inline_query_total');
    return ctx.answerInlineQuery(results, { cache_time: 600 });
  }

  // No cache: try to get a fast result, but with timeout protection
  console.log('Cache miss for:', cacheKey);
  
  // Create a promise that resolves with the API result
  console.time('inline_query_api');
  const apiPromise = (async () => {
    try {
      const res = await askFerePro(q);
      const userAnswer = extractUserFacingAnswer(res.answer);
      const prettyAnswer = prettifyAnswer(userAnswer);
      const { title, description } = parseKPIs(prettyAnswer, q);
      const detailsHtml = toHtmlDetails(prettyAnswer, q);
      const article = {
        type: 'article',
        id: crypto.randomUUID(),
        title: title,
        description: description,
        thumb_url: res.chart_url || 'https://fere.ai/logo.png',
        thumb_width: 200,
        thumb_height: 200,
        input_message_content: {
          message_text: detailsHtml + (res.deep_link ? `\n\n<b>🔗 <a href=\"${res.deep_link}\">View on Fereai.xyz</a></b>` : ''),
          parse_mode: 'HTML'
        },
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Run your own ↗️', switch_inline_query: '' }],
            [{ text: 'Deep Dive ↗️', url: 'https://fereai.xyz' }]
          ]
        }
      };
      return [article];
    } catch (err) {
      console.error('API error:', err);
      return null;
    }
  })();
  console.timeEnd('inline_query_api');

  // Wait for either the API result or timeout (1.5 seconds)
  const timeoutPromise = new Promise(resolve => setTimeout(() => resolve(null), 1500));
  
  try {
    console.time('inline_query_race');
    const results = await Promise.race([apiPromise, timeoutPromise]);
    console.timeEnd('inline_query_race');
    
    if (results) {
      // API call succeeded within timeout
      await cache.set(cacheKey, JSON.stringify(results), 600); // Cache for 10 minutes
      console.log('Cached result for:', cacheKey);
      console.log('Sending inline results (fresh):', JSON.stringify(results, null, 2));
      console.timeEnd('inline_query_total');
      return ctx.answerInlineQuery(results, { cache_time: 600 });
    } else {
      // Timeout reached, show loading card and continue in background
      ctx.answerInlineQuery([
        {
          type: 'article',
          id: 'loading',
          title: '⏳ Working... (please try again in a few seconds)',
          description: 'This query takes a few seconds to process. Please repeat your search in 2–3 seconds for the result.',
          input_message_content: {
            message_text: 'Your request is being processed. Please repeat your query in a few seconds to see the answer.'
          }
        }
      ], { cache_time: 1 });

      // Continue the API call in background
      apiPromise.then(async (results) => {
        if (results) {
          await cache.set(cacheKey, JSON.stringify(results), 600); // Cache for 10 minutes
          console.log('Cached result for:', cacheKey);
        }
      }).catch(err => {
        console.error('Background API error:', err);
      });
    }
  } catch (err) {
    console.error('Inline query error:', err);
    // Fallback to loading card
    console.timeEnd('inline_query_total');
    return ctx.answerInlineQuery([
      {
        type: 'article',
        id: 'error',
        title: '❌ Error',
        description: 'Something went wrong. Please try again.',
        input_message_content: {
          message_text: 'Sorry, there was an error processing your query. Please try again.'
        }
      }
    ], { cache_time: 1 });
  }
});

bot.launch();

// Enable graceful stop
process.once('SIGINT', () => {
  try {
    bot.stop('SIGINT');
  } catch (err) {
    if (err && err.message && err.message.includes('Bot is not running!')) {
      console.log('Bot was already stopped.');
    } else {
      console.error('Error during bot shutdown (SIGINT):', err);
    }
  }
});
process.once('SIGTERM', () => {
  try {
    bot.stop('SIGTERM');
  } catch (err) {
    if (err && err.message && err.message.includes('Bot is not running!')) {
      console.log('Bot was already stopped.');
    } else {
      console.error('Error during bot shutdown (SIGTERM):', err);
    }
  }
});