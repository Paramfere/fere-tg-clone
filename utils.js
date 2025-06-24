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

function prettifyAnswer(answer) {
  if (!answer) return '';
  let pretty = answer;
  pretty = pretty.replace(/(?<=\n|^)###/g, '\n\n🚦');
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
  pretty = pretty.replace(/\n{2,}/g, '\n\n');
  return pretty.trim();
}

function parseKPIs(prettyAnswer, query = '') {
  let title = 'Crypto Research';
  if (query.toLowerCase().includes('price')) {
    const priceMatch = prettyAnswer.match(/current price.*?(\$[\d,\.]+)/i);
    if (priceMatch) {
      const token = query.split(' ')[0].toUpperCase();
      title = `💰 ${token} Price: ${priceMatch[1]}`;
    } else {
      title = `💰 ${query.charAt(0).toUpperCase() + query.slice(1)}`;
    }
  } else if (query.toLowerCase().includes('top') && query.toLowerCase().includes('gainers')) {
    title = '📈 Top Gainers (24h)';
  } else if (query.toLowerCase().includes('top') && query.toLowerCase().includes('losers')) {
    title = '📉 Top Losers (24h)';
  } else if (query.toLowerCase().match(/\b(btc|eth|sol|ada|dot|link|uni|aave|comp|mkr|sushi|yfi|crv|bal|snx|ren|zrx|knc|band|oxt|nrg|storj|man|bat|zec|dash|ltc|bch|etc|xrp|trx|vet|matic|avax|atom|near|ftm|algo|hbar|icp|fil)\b/)) {
    const token = query.toLowerCase().match(/\b(btc|eth|sol|ada|dot|link|uni|aave|comp|mkr|sushi|yfi|crv|bal|snx|ren|zrx|knc|band|oxt|nrg|storj|man|bat|zec|dash|ltc|bch|etc|xrp|trx|vet|matic|avax|atom|near|ftm|algo|hbar|icp|fil)\b/)[0].toUpperCase();
    title = `🪙 ${token} Analysis`;
  } else if (query.toLowerCase().includes('market cap') || query.toLowerCase().includes('mcap')) {
    title = '💰 Market Cap Analysis';
  } else if (query.toLowerCase().includes('volume')) {
    title = '📊 Volume Analysis';
  } else if (query.toLowerCase().includes('sentiment')) {
    title = '😊 Sentiment Analysis';
  } else if (query.toLowerCase().includes('technical') || query.toLowerCase().includes('ta') || query.toLowerCase().includes('chart')) {
    title = '📈 Technical Analysis';
  } else if (query.toLowerCase().includes('fundamental') || query.toLowerCase().includes('fundamentals')) {
    title = '📋 Fundamental Analysis';
  } else if (query.toLowerCase().includes('news')) {
    title = '📰 Latest News';
  } else if (query.toLowerCase().includes('trend') || query.toLowerCase().includes('trending')) {
    title = '📈 Market Trends';
  } else {
    const titleMatch = prettyAnswer.match(/([A-Z]+).*SMA.*([\-\+]?\d+\.?\d*) ?%/i);
    if (titleMatch) {
      title = `${titleMatch[1]} 20-Day SMA: ${titleMatch[2]}% ${parseFloat(titleMatch[2]) < 0 ? '⛔' : '✅'}`;
    } else {
      const tokenMatch = prettyAnswer.match(/\b([A-Z]{2,10})\s*\([A-Z]{2,10}\)/);
      if (tokenMatch) {
        title = `🪙 ${tokenMatch[1]} Research`;
      } else {
        title = `🔍 ${query.charAt(0).toUpperCase() + query.slice(1)}`;
      }
    }
  }
  let description = '';
  const priceMatch = prettyAnswer.match(/current price.*?(\$[\d,\.]+)/i);
  if (priceMatch) {
    description += `💲 ${priceMatch[1]} `;
  }
  const mcapMatch = prettyAnswer.match(/market cap.*?(\$[\d,\.]+)/i);
  if (mcapMatch) {
    description += `• 💰 ${mcapMatch[1]} `;
  }
  const changeMatch = prettyAnswer.match(/([\-\+]?\d+\.?\d*)%/);
  if (changeMatch) {
    const change = changeMatch[1];
    const emoji = parseFloat(change) >= 0 ? '📈' : '📉';
    description += `• ${emoji} ${change}%`;
  }
  if (!description) {
    description = 'Crypto research result';
  }
  return { title: title.slice(0, 64), description: description.slice(0, 256) };
}

function formatTableForTelegram(tableText) {
  const lines = tableText
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('|'));
  const rows = lines.map(line =>
    line
      .split('|')
      .map(col => col.trim())
      .filter(Boolean)
  );
  const colWidths = [];
  rows.forEach(row => {
    row.forEach((col, i) => {
      colWidths[i] = Math.max(colWidths[i] || 0, col.length);
    });
  });
  const formattedRows = rows.map(row =>
    row.map((col, i) => col.padEnd(colWidths[i])).join('  ')
  );
  return `<pre>${formattedRows.join('\n')}</pre>`;
}

function formatYieldTable(tableText, title = 'Top Yield-Bearing Tokens', query = '') {
  const lines = tableText.split('\n').filter(line => line.trim().startsWith('|'));
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

function formatFullCoinTable(tableText, title = 'Top Gainers') {
  const lines = tableText.split('\n').filter(line => line.trim().startsWith('|'));
  let result = `<b>${title}</b>\n\n`;
  let count = 1;
  lines.forEach(line => {
    const cols = line.split('|').map(c => c.trim());
    if (cols.length >= 9 && cols[1] && cols[2]) {
      const tokenName = cols[1];
      const tokenSymbol = cols[2];
      const tokenLink = `https://coingecko.com/en/coins/${tokenName.toLowerCase().replace(/\s+/g, '-')}`;
      result += `${count}. <b><a href="${tokenLink}">${tokenName} (${tokenSymbol})</a></b>\n`;
      result += `   Price: <b>${cols[3]}</b> | MCap: <b>${cols[4]}</b>\n`;
      result += `   Change: <b>${cols[5]}</b> (24h), <b>${cols[6]}</b> (3mo)\n`;
      result += `   Supply: <b>${cols[7]}</b> | Chain: <b>${cols[8]}</b>\n\n`;
      count++;
    }
  });
  return result.trim();
}

function toHtmlDetails(prettyAnswer, query = '') {
  let html = prettyAnswer.replace(/^#+\s?/gm, '');
  const tableLines = html.split('\n').filter(line => line.trim().startsWith('|'));
  if (tableLines.length >= 3) {
    const dataRows = tableLines.slice(2);
    let result = `<b>${query ? `Top Results for: ${query}` : 'Top Results'}</b>\n\n`;
    let count = 1;
    dataRows.forEach(line => {
      const cols = line.split('|').map(c => c.trim()).filter(c => c);
      if (cols.length >= 4 && cols[1] && cols[2]) {
        const tokenName = cols[1];
        const tokenSymbol = cols[2];
        const tokenLink = `https://coingecko.com/en/coins/${tokenName.toLowerCase().replace(/\s+/g, '-')}`;
        result += `${count}. <b><a href=\"${tokenLink}\">${tokenName} (${tokenSymbol})</a></b>\n`;
        if (cols[3]) result += `   Price: <b>${cols[3]}</b>`;
        if (cols[4]) result += ` | MCap: <b>${cols[4]}</b>`;
        if (cols[5]) result += ` | Change: <b>${cols[5]}</b>`;
        if (cols[6]) result += ` | Supply: <b>${cols[6]}</b>`;
        if (cols[7]) result += ` | ${cols[7]}`;
        result += '\n\n';
        count++;
      }
    });
    return result.trim();
  }
  let heading = query ? `<b>${query.charAt(0).toUpperCase() + query.slice(1)}</b>\n\n` : '';
  return heading + html.trim();
}

module.exports = {
  extractUserFacingAnswer,
  prettifyAnswer,
  parseKPIs,
  formatTableForTelegram,
  formatYieldTable,
  formatSimpleCoinTable,
  formatFullCoinTable,
  toHtmlDetails
}; 