
import zarinPal from "./zarinpal.js"

const BOT_TOKEN = "7849120485:AAFl9xK2mP8qRtL5n3vB1wY6zX9oP0qR1sT";
const BOT_ID = "@myshop_bot";
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const HEZINE_ERSAL = 100000;
const HOOK = BOT_TOKEN.split(":")[1]

const myZarinPal = new zarinPal({
    merchantId: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    sandbox: true
})


export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);


        if (url.pathname === "/init" || url.pathname.startsWith("/init")) {


            // ۱. ساخت جداول دیتابیس D1 در صورت عدم وجود
            let dbStatus = "نامشخص";
            try {
                await env.DB.batch([
                    env.DB.prepare(`
                CREATE TABLE IF NOT EXISTS carts (
                    user_id INTEGER PRIMARY KEY,
                    cart_data TEXT NOT NULL DEFAULT '{}',
                    state TEXT DEFAULT NULL
                )
            `),
                    env.DB.prepare(`
                CREATE TABLE IF NOT EXISTS orders (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    products TEXT NOT NULL,
                    price INTEGER NOT NULL,
                    shipping_info TEXT,
                    paid INTEGER DEFAULT 0,
                    payment_info TEXT DEFAULT NULL,
                    status INTEGER DEFAULT 0
                )
            `),
                    env.DB.prepare(`
                CREATE TABLE IF NOT EXISTS products (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    title TEXT NOT NULL,
                    price INTEGER NOT NULL,
                    description TEXT
                )
            `)
                ]);
                dbStatus = "✅ جداول دیتابیس با موفقیت آماده/ایجاد شدند.";
            } catch (e) {
                dbStatus = `❌ خطا در ایجاد جداول دیتابیس: ${e.message}`;
            }

            // ۲. ارسال درخواست تنظیم وب‌هوک به تلگرام
            const telegramResponse = await fetch(`${TELEGRAM_API}/setWebhook`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    url: `${url.origin}/${HOOK}`,
                    allowed_updates: ["message", "callback_query"]
                })
            });

            const telegramResult = await telegramResponse.json();

            // ۳. بازگرداندن وضعیت دیتابیس و وب‌هوک در قالب JSON
            return new Response(
                JSON.stringify(
                    {
                        database: dbStatus,
                        webhook_url: `${url.origin}/${HOOK}`,
                        telegram_result: telegramResult
                    },
                    null,
                    2
                ),
                {
                    headers: { "Content-Type": "application/json; charset=utf-8" }
                }
            );


        }


        if (url.pathname.startsWith("/orders")) {
            const { results } = await env.DB.prepare(
                "SELECT * FROM orders ORDER BY id DESC"
            ).all();

            // ساخت قالب HTML برای نمایش اطلاعات
            const html = `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>مدیریت سفارش‌ها</title>
    <style>
        :root {
            --bg-color: #0f172a;
            --card-bg: #1e293b;
            --text-color: #f1f5f9;
            --text-muted: #94a3b8;
            --border-color: #334155;
            --accent: #3b82f6;
            --success: #10b981;
            --danger: #ef4444;
        }
        body {
            font-family: system-ui, -apple-system, sans-serif;
            background-color: var(--bg-color);
            color: var(--text-color);
            margin: 0;
            padding: 20px;
        }
        .container {
            max-width: 1000px;
            margin: 0 auto;
        }
        h1 {
            text-align: center;
            margin-bottom: 30px;
            color: var(--text-color);
        }
        .order-card {
            background-color: var(--card-bg);
            border: 1px solid var(--border-color);
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 20px;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        }
        .order-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid var(--border-color);
            padding-bottom: 12px;
            margin-bottom: 15px;
            flex-wrap: wrap;
            gap: 10px;
        }
        .order-id {
            font-weight: bold;
            font-size: 1.1rem;
            color: var(--accent);
        }
        .badge {
            padding: 4px 10px;
            border-radius: 20px;
            font-size: 0.85rem;
            font-weight: bold;
        }
        .badge-success { background-color: rgba(16, 185, 129, 0.2); color: var(--success); }
        .badge-danger { background-color: rgba(239, 68, 68, 0.2); color: var(--danger); }
        
        .grid-info {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 15px;
            margin-bottom: 15px;
        }
        .section-title {
            font-size: 0.9rem;
            color: var(--text-muted);
            margin-bottom: 5px;
            font-weight: bold;
        }
        .box {
            background: rgba(15, 23, 42, 0.5);
            padding: 10px 12px;
            border-radius: 8px;
            border: 1px solid var(--border-color);
            font-size: 0.9rem;
        }
        ul {
            margin: 0;
            padding-right: 20px;
        }
        li {
            margin-bottom: 4px;
        }
        .price-tag {
            font-weight: bold;
            color: #38bdf8;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>لیست سفارش‌ها</h1>
        ${results.length === 0 ? '<p style="text-align: center; color: var(--text-muted);">هیچ سفارشی ثبت نشده است.</p>' : ''}
        
        ${results.map(order => {
                // پارس کردن امن محصولات و اطلاعات پرداخت
                let products = [];
                try { products = JSON.parse(order.products); } catch (e) { }

                let payment = null;
                try { payment = JSON.parse(order.payment_info); } catch (e) { }

                const isPaid = order.paid === 1;
                const refId = payment?.result?.data?.ref_id || 'نامشخص';
                const cardPan = payment?.result?.data?.card_pan || '---';

                return `
            <div class="order-card">
                <div class="order-header">
                    <span class="order-id">سفارش شماره #${order.id} (کاربر: ${order.user_id})</span>
                    <div>
                        <span class="badge ${isPaid ? 'badge-success' : 'badge-danger'}">
                            ${isPaid ? 'پرداخت شده' : 'پرداخت نشده'}
                        </span>
                    </div>
                </div>

                <div class="grid-info">
                    <div class="box">
                        <div class="section-title">محصولات</div>
                        <ul>
                            ${products.map(p => `<li>${p.title} (تعداد: ${p.quantity}) - <span class="price-tag">${p.price.toLocaleString()} تومان</span></li>`).join('')}
                        </ul>
                        <div style="margin-top: 8px; border-top: 1px dashed var(--border-color); padding-top: 5px;">
                            <strong>مجموع کل: </strong> <span class="price-tag">${order.price.toLocaleString()} تومان</span>
                        </div>
                    </div>

                    <div class="box">
                        <div class="section-title">اطلاعات ارسال</div>
                        <p style="margin: 0; white-space: pre-line;">${order.shipping_info || 'ثبت نشده'}</p>
                    </div>

                    <div class="box" style="grid-column: 1 / -1;">
                        <div class="section-title">اطلاعات پرداخت (زرین‌پال)</div>
                        <div style="display: flex; gap: 20px; flex-wrap: wrap; font-size: 0.85rem;">
                            <span>کد پیگیری (RefID): <strong>${refId}</strong></span>
                            <span>شماره کارت: <strong>${cardPan}</strong></span>
                            <span>وضعیت درگاه: <strong>${payment?.result?.data?.message || '---'}</strong></span>
                        </div>
                    </div>
                </div>
            </div>
          `;
            }).join('')}
    </div>
</body>
</html>`;

            return new Response(html, {
                headers: { "Content-Type": "text/html;charset=UTF-8" },
            });
        }

        if (url.pathname.startsWith("/pay/")) {


            const orderId = url.pathname.split("/pay/")[1];
            const order = await env.DB.prepare("SELECT * FROM orders WHERE id = ?").bind(orderId).first();

            if (!order) return new Response("سفارش یافت نشد", { status: 404 });
            if (order.paid == "1") return new Response("قبلا پرداخت شده", { status: 404 });


            let phone = extractPhone(order.shipping_info)

            if (!phone) {
                phone = "09121234567"
            }

            const zarinPalPayment = await myZarinPal.createPayment({
                orderId: order.id,
                amount: order.price * 10,
                callback_url: url.origin + "/verify/" + order.id,
                phone: phone,
            });


            await env.DB.prepare(`UPDATE orders set payment_info = ? where id = ?`)
                .bind(JSON.stringify(
                    {
                        "type": "zarinpal", "request": zarinPalPayment.result

                    }
                ), order.id).run();



            return new Response(zarinPalPayment.htmlRedirect,
                {
                    headers: {
                        "content-type": "text/html;charset=UTF-8"
                    }
                });


        }



        if (url.pathname.startsWith("/verify/")) {




            const orderId = url.pathname.split("/verify/")[1];
            const order = await env.DB.prepare("SELECT * FROM orders WHERE id = ?").bind(orderId).first();

            const payment_info = JSON.parse(order.payment_info);






            if (payment_info.type == "zarinpal") {


                const verify = await myZarinPal.verifyPayment({
                    amount: order.price * 10,
                    authority: payment_info.request['data']['authority'],
                });

                payment_info['result'] = verify.result;
                await env.DB.prepare(`UPDATE orders set payment_info = ? where id = ?`).bind(JSON.stringify(payment_info), order.id).run();



                let resultMgs = ""
                if (verify.success) {
                    resultMgs = "<h2 style=' color: #28a745;'>✅" + "پرداخت با موفقیت انجام شد" + "</h2>";
                    await env.DB.prepare(`UPDATE orders set paid = ? , status = ? where id = ?`).bind(1, 1, order.id).run();
                } else {
                    resultMgs = "<h2 style=' color: #ad0a0aff;'>❌" + "خطا در پرداخت" + "</h2>";
                }

                const TELEGRAM_URL = `tg://resolve?domain=${BOT_ID.replace(/^@/, '')}`; // نام کاربری ربات (بدون @)

                return new Response(`<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>پرداخت آنلاین</title>
  <style>
    body { background: #121212; color: #fff; font-family: sans-serif; text-align: center; padding-top: 18vh; }
    .icon { font-size: 50px; color: #28a745; margin-bottom: 10px; }
    h2 { margin-bottom: 8px; }
    p { color: #aaa; margin-bottom: 25px; }
    .btn {
      display: inline-block;
      background: #0088cc;
      color: #fff;
      padding: 12px 24px;
      border-radius: 8px;
      text-decoration: none;
      font-weight: bold;
    }
  </style>
</head>
<body>

  ${resultMgs}
  <p>می‌توانید به ربات تلگرام بازگردید.</p>
  <a class="btn" href="${TELEGRAM_URL}">بازگشت به ربات تلگرام</a>
</body>
</html>`, {
                    headers: { "content-type": "text/html;charset=UTF-8" },
                });

            }

            return new Response(order.payment_info, { status: 200 });

        }




        // ۲. دریافت Webhook از تلگرام
        if (request.method === "POST") {

            if (url.pathname !== `/${HOOK}`) {
                return new Response("Unauthorized", { status: 401 });
            }


            try {
                const update = await request.json();
                await handleUpdate(update, env, url.origin);
            } catch (e) {
                console.error(e);
            }
            return new Response("OK");
        }

        return new Response("Telegram Bot Worker is Running!");
    }
};

// ==========================================
// توابع اصلی پردازش و توابع کمکی Telegram API
// ==========================================

async function handleUpdate(update, env, baseUrl) {
    if (update.message) {
        const msg = update.message;
        const chatId = msg.chat.id;
        const text = msg.text;

        // بررسی حالت کاربر (آیا منتظر دریافت آدرس هستیم؟)
        const userCart = await getCart(env.DB, chatId);
        if (userCart && userCart.state === "awaiting_address" && text && !text.startsWith("/")) {
            await processCheckout(env.DB, chatId, text, baseUrl);
            return;
        }

        // دستورات کیبورد اصلی
        if (text === "/start") {
            await sendReplyKeyboard(env.DB, chatId, "به فروشگاه خوش آمدید!");
        } else if (text === "🛍️محصولات") {
            await showProductsList(env.DB, chatId);
        } else if (text?.startsWith("🛒سبد خرید")) {
            await showCartInline(env.DB, chatId);
        } else if (text === "✅نهایی سازی سفارش") {
            await startCheckoutProcess(env.DB, chatId);
        } else if (text === "📙سفارش های من") {
            await showMyOrders(env.DB, chatId);
        }
    }

    else if (update.callback_query) {
        const cq = update.callback_query;
        const chatId = cq.message.chat.id;
        const data = cq.data;

        await answerCallbackQuery(cq.id);

        if (data.startsWith("add_")) {
            const productId = parseInt(data.split("_")[1]);
            await updateCartItemQuantity(env.DB, chatId, productId, 1);
            await sendMessage(chatId, "✅ محصول به سبد خرید اضافه شد.");
            await sendReplyKeyboard(env.DB, chatId, "سبد خرید شما به‌روزرسانی شد.");
        } else if (data.startsWith("view_")) {
            const productId = parseInt(data.split("_")[1]);
            await showProductDetails(env.DB, chatId, productId);
        } else if (data.startsWith("increase ")) {
            const productId = parseInt(data.split(" ")[1]);
            await updateCartItemQuantity(env.DB, chatId, productId, 1);
            await showCartInline(env.DB, chatId, cq.message.message_id);
        } else if (data.startsWith("decrease ")) {
            const productId = parseInt(data.split(" ")[1]);
            await updateCartItemQuantity(env.DB, chatId, productId, -1);
            await showCartInline(env.DB, chatId, cq.message.message_id);
        } else if (data.startsWith("delete ")) {
            const productId = parseInt(data.split(" ")[1]);
            await removeCartItem(env.DB, chatId, productId);
            await showCartInline(env.DB, chatId, cq.message.message_id);
        } else if (data === "checkout") {
            await startCheckoutProcess(env.DB, chatId);
        }
    }
}

// --- توابع ارتباط با Telegram API ---

async function sendMessage(chatId, text, replyMarkup = null) {
    const body = { chat_id: chatId, text, parse_mode: "HTML" };
    if (replyMarkup) body.reply_markup = replyMarkup;

    return fetch(`${TELEGRAM_API}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    });
}

async function editMessageText(chatId, messageId, text, replyMarkup = null) {
    const body = { chat_id: chatId, message_id: messageId, text, parse_mode: "HTML" };
    if (replyMarkup) body.reply_markup = replyMarkup;

    return fetch(`${TELEGRAM_API}/editMessageText`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    });
}

async function answerCallbackQuery(callbackQueryId) {
    return fetch(`${TELEGRAM_API}/answerCallbackQuery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callback_query_id: callbackQueryId })
    });
}

// --- کیبورد اصلی (Reply Keyboard) ---

async function sendReplyKeyboard(db, chatId, textMessage) {
    const cart = await getCart(db, chatId);
    const totalCount = Object.values(cart.data).reduce((a, b) => a + b, 0);

    const cartButtonText = totalCount > 0
        ? `سبد خرید (${totalCount}) مورد`
        : "سبد خرید";

    const keyboard = {
        keyboard: [
            [{ text: "🛍️" + "محصولات" }],
            [{ text: "🛒" + cartButtonText }, { text: "✅" + "نهایی سازی سفارش" }],
            [{ text: "📙" + "سفارش های من" }]
        ],
        resize_keyboard: true
    };

    await sendMessage(chatId, textMessage, keyboard);
}

// --- مدیریت محصولات ---

async function showProductsList(db, chatId) {
    const { results: products } = await db.prepare("SELECT * FROM products").all();

    if (!products || products.length === 0) {
        return sendMessage(chatId, "هیچ محصولی یافت نشد.");
    }

    const inlineKeyboard = products.map(p => [
        { text: `${p.title} - ${p.price.toLocaleString('fa-IR')} تومان`, callback_data: `view_${p.id}` }
    ]);

    await sendMessage(chatId, "لیست محصولات:", { inline_keyboard: inlineKeyboard });
}

async function showProductDetails(db, chatId, productId) {
    const product = await db.prepare("SELECT * FROM products WHERE id = ?").bind(productId).first();
    if (!product) return;

    const caption = `<b>${product.title}</b>\n\n${product.description || ''}\n\n<b>قیمت:</b> ${product.price.toLocaleString('fa-IR')} تومان`;
    const markup = {
        inline_keyboard: [
            [{ text: "🛒 افزودن به سبد خرید", callback_data: `add_${product.id}` }]
        ]
    };

    await sendMessage(chatId, caption, markup);
}

// --- مدیریت سبد خرید ---

async function getCart(db, userId) {
    const row = await db.prepare("SELECT * FROM carts WHERE user_id = ?").bind(userId).first();
    if (!row) return { data: {}, state: null };
    return {
        data: JSON.parse(row.cart_data || "{}"),
        state: row.state
    };
}

async function saveCart(db, userId, cartData, state = null) {
    await db.prepare(`
    INSERT INTO carts (user_id, cart_data, state) 
    VALUES (?, ?, ?) 
    ON CONFLICT(user_id) DO UPDATE SET cart_data = excluded.cart_data, state = excluded.state
  `).bind(userId, JSON.stringify(cartData), state).run();
}

async function updateCartItemQuantity(db, userId, productId, delta) {
    const cart = await getCart(db, userId);
    const currentQty = cart.data[productId] || 0;
    const newQty = currentQty + delta;

    if (newQty <= 0) {
        delete cart.data[productId];
    } else {
        cart.data[productId] = newQty;
    }

    await saveCart(db, userId, cart.data, cart.state);
}

async function removeCartItem(db, userId, productId) {
    const cart = await getCart(db, userId);
    delete cart.data[productId];
    await saveCart(db, userId, cart.data, cart.state);
}

async function showCartInline(db, chatId, messageIdToEdit = null) {
    const cart = await getCart(db, chatId);
    const productIds = Object.keys(cart.data);

    if (productIds.length === 0) {
        const emptyText = "سبد خرید شما خالی است.";
        if (messageIdToEdit) {
            return editMessageText(chatId, messageIdToEdit, emptyText);
        }
        return sendMessage(chatId, emptyText);
    }

    const { results: products } = await db.prepare(
        `SELECT * FROM products WHERE id IN (${productIds.join(",")})`
    ).all();

    let totalPrice = 0;
    const inlineKeyboard = [];

    for (const p of products) {
        const qty = cart.data[p.id];
        totalPrice += p.price * qty;

        inlineKeyboard.push([
            { text: "حذف", callback_data: `delete ${p.id}` },
            { text: `${p.title} (${qty}عدد)`, callback_data: "null" },
            { text: "-", callback_data: `decrease ${p.id}` },
            { text: "+", callback_data: `increase ${p.id}` }
        ]);
    }

    inlineKeyboard.push([{ text: "✅ نهایی کردن سفارش", callback_data: "checkout" }]);

    const messageText = `سبد خرید \n مجموع ${totalPrice.toLocaleString('fa-IR')} تومان`;
    const markup = { inline_keyboard: inlineKeyboard };

    if (messageIdToEdit) {
        await editMessageText(chatId, messageIdToEdit, messageText, markup);
    } else {
        await sendMessage(chatId, messageText, markup);
    }
}

// --- فرآیند نهایی‌سازی سفارش و ثبت ---

async function startCheckoutProcess(db, chatId) {
    const cart = await getCart(db, chatId);
    if (Object.keys(cart.data).length === 0) {
        return sendMessage(chatId, "سبد خرید شما خالی است!");
    }

    // تغییر حالت کاربر به حالت در انتظار آدرس
    await saveCart(db, chatId, cart.data, "awaiting_address");
    await sendMessage(chatId, "لطفاً نام، آدرس دقیق و شماره تماس خود را ارسال کنید:");
}

async function processCheckout(db, chatId, shippingInfo, baseUrl) {
    const cart = await getCart(db, chatId);
    const productIds = Object.keys(cart.data);

    if (productIds.length === 0) return;

    const { results: products } = await db.prepare(
        `SELECT * FROM products WHERE id IN (${productIds.join(",")})`
    ).all();

    let itemsPrice = 0;
    const orderProductsList = [];

    for (const p of products) {
        const qty = cart.data[p.id];
        const lineTotal = p.price * qty;
        itemsPrice += lineTotal;

        orderProductsList.push({
            id: p.id,
            title: p.title,
            price: p.price,
            quantity: qty
        });
    }

    // اضافه کردن هزینه ارسال به عنوان آخرین المنت لیست محصولات
    orderProductsList.push({
        id: "shipping",
        title: "هزینه ارسال",
        price: HEZINE_ERSAL,
        quantity: 1
    });

    const finalPrice = itemsPrice + HEZINE_ERSAL;

    // ثبت سفارش در D1
    const res = await db.prepare(`
    INSERT INTO orders (user_id, products, price, shipping_info, paid, status)
    VALUES (?, ?, ?, ?, 0, 0)
  `).bind(chatId, JSON.stringify(orderProductsList), finalPrice, shippingInfo).run();

    const orderId = res.meta.last_row_id;

    // پاکسازی سبد خرید و ریست کردن state
    await saveCart(db, chatId, {}, null);
    await sendReplyKeyboard(db, chatId, "سفارش شما با موفقیت ثبت شد.");

    // ساخت متن فاکتور متنی بدون Inline Keyboard انتخاب آیتم
    let invoiceText = `<b>فاکتور سفارش #${orderId}</b>\n\n`;
    for (const item of orderProductsList) {
        if (item.id === "shipping") {
            invoiceText += `🚚 <b>${item.title}:</b> ${item.price.toLocaleString('fa-IR')} تومان\n`;
        } else {
            invoiceText += `• ${item.title} (${item.quantity} عدد) - ${(item.price * item.quantity).toLocaleString('fa-IR')} تومان\n`;
        }
    }

    invoiceText += `\n<b>مجموع کل فاکتور:</b> ${finalPrice.toLocaleString('fa-IR')} تومان\n`;
    invoiceText += `<b>اطلاعات ارسال:</b>\n${shippingInfo}`;

    const payMarkup = {
        inline_keyboard: [
            [{ text: "پرداخت آنلاین", url: `${baseUrl}/pay/${orderId}` }]
        ]
    };

    await sendMessage(chatId, invoiceText, payMarkup);
}

// --- لیست سفارش‌های من ---

async function showMyOrders(db, chatId) {
    const { results: orders } = await db.prepare(
        "SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC"
    ).bind(chatId).all();

    if (!orders || orders.length === 0) {
        return sendMessage(chatId, "شما هنوز هیچ سفارشی ثبت نکرده‌اید.");
    }

    const statusTextMap = {
        0: "معلق",
        1: "پرداخت شده",
        2: "آماده سازی",
        3: "ارسال شده"
    };

    let responseText = "<b>📦 لیست سفارش‌های شما:</b>\n\n";

    for (const order of orders) {
        const statusStr = statusTextMap[order.status] || "نامشخص";
        responseText += `<b>کد سفارش:</b> #${order.id}\n`;
        responseText += `<b>مبلغ:</b> ${Number(order.price).toLocaleString('fa-IR')} تومان\n`;
        responseText += `<b>وضعیت:</b> ${statusStr}\n`;
        responseText += `-------------------------\n`;
    }

    await sendMessage(chatId, responseText);
}

function extractPhone(text) {
    if (!text) return null;

    // تبدیل اعداد فارسی و عربی به انگلیسی
    const norm = text.replace(/[۰-۹٠-٩]/g, c => c.charCodeAt(0) & 15);

    // استخراج اولین شماره معتبر و بازگرداندن آن به فرمت استاندارد
    const match = norm.match(/(?:\+98|0098|0)?(9\d{9})\b/);
    return match ? '0' + match[1] : null;
}
