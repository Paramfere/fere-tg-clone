const { Telegraf } = require("telegraf");
const rateLimit = require("telegraf-ratelimit");
require('dotenv').config();
const { askFerePro } = require('./fereClient');
const cache = require('./redis');
const crypto = require('crypto');
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
  console.log({ user: ctx.from.id, prompt });
  const cacheKey = `text:${crypto.createHash('md5').update(prompt).digest('hex')}`;

  // 1. Check cache first
  try {
    const cached = await cache.get(cacheKey);
    if (cached) {
      console.log('Cache hit for text prompt:', cacheKey);
      const cachedData = JSON.parse(cached);
      // Send reply from cache
      await ctx.reply(cachedData.answer, { parse_mode: 'HTML' });
      if (cachedData.chart_url) {
        await ctx.replyWithPhoto(cachedData.chart_url);
      }
      if (cachedData.deep_link) {
        await ctx.reply(`🔗 <a href="${cachedData.deep_link}">View detailed analysis on Fereai.xyz</a>`, { parse_mode: 'HTML' });
      }
      return;
    }
  } catch (err) {
    console.error('Redis GET error:', err);
  }

  // 2. If not in cache, call API and then cache the result
  // Send a quick placeholder
  const workingMsg = await ctx.reply("⏳ Working on your request...");
  try {
    const res = await askFerePro(prompt);
    const userAnswer = extractUserFacingAnswer(res.answer);
    const prettyAnswer = prettifyAnswer(userAnswer);
    const formattedAnswer = toHtmlDetails(prettyAnswer, prompt);

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
          reply_markup: {
            inline_keyboard: [
              [
                { text: '🐦 Share on X', url: `https://twitter.com/intent/tweet?text=${encodeURIComponent(prompt)}` },
                { text: '📋 Copy Answer', callback_data: 'copy_answer' }
              ],
              [
                { text: '🔗 View on Fereai.xyz', url: res.deep_link || 'https://fereai.xyz' }
              ]
            ]
          }
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

    // Cache the result
    try {
      const cacheData = {
        answer: formattedAnswer,
        chart_url: res.chart_url,
        deep_link: res.deep_link
      };
      await cache.set(cacheKey, JSON.stringify(cacheData), 1800); // Cache for 30 minutes
      console.log('Cached result for text prompt:', cacheKey);
    } catch (err) {
      console.error('Redis SET error:', err);
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