// Telegram bot command handlers placeholder

export interface BotContext {
  message: {
    text: string;
    from: {
      id: number;
      first_name: string;
    };
  };
  reply: (text: string) => Promise<void>;
}

export const commands = {
  start: async (ctx: BotContext) => {
    await ctx.reply(
      'Welcome to Grocery POS Bot!\n\n' +
        'Available commands:\n' +
        '/stock - Check low stock items\n' +
        '/today - Get today\'s sales summary\n' +
        '/add <barcode> <quantity> - Add inventory\n' +
        '/search <query> - Search products',
    );
  },

  stock: async (ctx: BotContext, getLowStock: () => Promise<any[]>) => {
    const lowStock = await getLowStock();

    if (lowStock.length === 0) {
      await ctx.reply('✅ All products have sufficient stock!');
      return;
    }

    let message = '⚠️ *Low Stock Items:*\n\n';
    for (const product of lowStock) {
      message += `• ${product.nameRu}: ${product.stock} ${product.unit}\n`;
    }

    await ctx.reply(message);
  },

  today: async (
    ctx: BotContext,
    getSummary: () => Promise<{ totalSales: number; totalRevenue: number }>,
  ) => {
    const summary = await getSummary();

    const message =
      `📊 *Today's Summary*\n\n` +
      `Sales: ${summary.totalSales}\n` +
      `Revenue: ${summary.totalRevenue.toLocaleString()} сум`;

    await ctx.reply(message);
  },

  search: async (
    ctx: BotContext,
    query: string,
    searchProducts: (q: string) => Promise<any[]>,
  ) => {
    if (!query) {
      await ctx.reply('Usage: /search <product name or barcode>');
      return;
    }

    const products = await searchProducts(query);

    if (products.length === 0) {
      await ctx.reply('No products found.');
      return;
    }

    let message = `🔍 *Search Results:*\n\n`;
    for (const product of products.slice(0, 10)) {
      message += `• ${product.nameRu}\n`;
      message += `  Price: ${product.price} сум\n`;
      message += `  Stock: ${product.stock} ${product.unit}\n\n`;
    }

    await ctx.reply(message);
  },

  add: async (
    ctx: BotContext,
    barcode: string,
    quantity: number,
    addInventory: (barcode: string, quantity: number) => Promise<boolean>,
  ) => {
    if (!barcode || !quantity) {
      await ctx.reply('Usage: /add <barcode> <quantity>');
      return;
    }

    try {
      const success = await addInventory(barcode, quantity);

      if (success) {
        await ctx.reply(`✅ Added ${quantity} units to product ${barcode}`);
      } else {
        await ctx.reply(`❌ Failed to add inventory. Product not found.`);
      }
    } catch (error) {
      await ctx.reply(`❌ Error: ${error}`);
    }
  },
};
