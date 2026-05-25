/**
 * Netlify Serverless Function: Stripe Checkout セッション作成
 *
 * 環境変数（Netlifyダッシュボードで設定）:
 *   STRIPE_SECRET_KEY  → Stripeシークレットキー（sk_live_... or sk_test_...）
 *   URL                → サイトURL（例: https://crystalize-kobe.netlify.app）
 *                        ※ Netlifyが自動で設定するため通常は手動設定不要
 */
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event) => {
  // POST のみ受け付け
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { items, hasPhysical, customerEmail } = JSON.parse(event.body);

    if (!items || items.length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'カートが空です' }),
      };
    }

    // ── Stripe line_items 構築 ──────────────────────────
    const lineItems = items.map((item) => ({
      price_data: {
        currency: 'jpy',           // 日本円（小数なし）
        product_data: {
          name: item.name,
          description: item.sub || undefined,
          // images: [`${process.env.URL}/images/${item.imageKey}`], // 商品画像URL（任意）
        },
        unit_amount: item.price,   // 例: 4800 → ¥4,800
      },
      quantity: item.qty,
    }));

    // ── Checkout Session オプション ───────────────────────
    const sessionParams = {
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      locale: 'ja',
      customer_email: customerEmail || undefined,

      // 決済完了後のリダイレクト先
      success_url: `${process.env.URL}/shop.html?checkout=success&session={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${process.env.URL}/shop.html?checkout=cancel`,
    };

    // ── 完成品（物理）がある場合は配送先を収集 ──────────────
    if (hasPhysical) {
      sessionParams.shipping_address_collection = {
        allowed_countries: ['JP'],
      };
      sessionParams.shipping_options = [
        {
          shipping_rate_data: {
            type: 'fixed_amount',
            fixed_amount: { amount: 660, currency: 'jpy' },
            display_name: '通常配送（ヤマト運輸）',
            delivery_estimate: {
              minimum: { unit: 'business_day', value: 3 },
              maximum: { unit: 'business_day', value: 7 },
            },
          },
        },
        {
          shipping_rate_data: {
            type: 'fixed_amount',
            fixed_amount: { amount: 0, currency: 'jpy' },
            display_name: 'デジタルデータのみ（配送なし）',
            delivery_estimate: {
              minimum: { unit: 'business_day', value: 1 },
              maximum: { unit: 'business_day', value: 1 },
            },
          },
        },
      ];
    }

    // ── Checkout Session 作成 ──────────────────────────
    const session = await stripe.checkout.sessions.create(sessionParams);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: session.url }),
    };

  } catch (err) {
    console.error('Stripe error:', err.message);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
