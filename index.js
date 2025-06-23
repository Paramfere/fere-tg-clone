const { Telegraf } = require("telegraf");
const rateLimit = require("telegraf-ratelimit");

// ⬇️  Replace the string with your BotFather token
const bot = new Telegraf("7740396951:AAHEI1q3GyIIiRN6dJmxZwVfKXiRgvi9xRs");

// Rate limiting middleware
bot.use(rateLimit({ window: 3000, limit: 5 }));

async function fereStub(prompt) {
  // Remove this once you have a real key
  return {
    answer: `*Fake answer* for “${prompt}”\n\n• Yield: 14 % APY\n• Risk: delta-neutral`,
    chart_url:
      "https://dummyimage.com/600x400/232323/ffffff.png&text=Demo+Chart",
    deep_link: "https://app.fere.ai/demo?query=" + encodeURIComponent(prompt),
  };
}

bot.start((ctx) =>
  ctx.reply("🔥 Hey! Send any crypto research prompt.")
);

bot.help((ctx) =>
  ctx.reply("Send any crypto research prompt and I'll give you a quick summary, chart, and deep link. Try asking about a token, strategy, or DeFi protocol!")
);

bot.command("about", (ctx) =>
  ctx.reply("Fere Bot: Instant crypto research powered by fere.ai. Built with Telegraf.\n\nhttps://fere.ai")
);

bot.on("text", async (ctx) => {
  const prompt = ctx.message.text;
  console.log({ user: ctx.from.id, prompt });
  const res = await fereStub(prompt);
  await ctx.reply(res.answer);
  await ctx.replyWithPhoto(res.chart_url);
  await ctx.reply(`Deep link: ${res.deep_link}`);
});

bot.inlineQuery(/(.+)/, async (ctx) => {
  const prompt = ctx.inlineQuery.query;
  console.log({ user: ctx.from.id, prompt });
  const res = await fereStub(prompt);
  return ctx.answerInlineQuery([
    {
      type: "article",
      id: "1",
      title: "Fere Research Result",
      description: res.answer,
      input_message_content: {
        message_text: `${res.answer}\n\n${res.deep_link}`,
        parse_mode: "Markdown",
      },
      thumb_url: res.chart_url,
    },
  ]);
});

bot.launch();
console.log("Bot is live. Hit Ctrl-C to stop.");

