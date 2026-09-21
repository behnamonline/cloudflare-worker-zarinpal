export default class zarinPal {

  constructor(params = {}) {
    this.params = params;
    this.mode = params.sandbox ? "sandbox" : "payment";
  }

  async createPayment(params) {

    const response = await fetch(`https://${this.mode}.zarinpal.com/pg/v4/payment/request.json`, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        merchant_id: this.params.merchantId,
        amount: params.amount,
        callback_url: params.callback_url,
        description: params.description || `سفارش شماره ${params.orderId}`,
        metadata: {
          mobile: params.phone || "",
          email: params.email || ""
        }
      })
    });

    const zarinpal_request = await response.json();


    // بررسی موفقیت‌آمیز بودن پاسخ زرین‌پال
    if (zarinpal_request?.data?.code === 100 && zarinpal_request?.data?.authority) {
      const PAYMENT_URL = `https://${this.mode}.zarinpal.com/pg/StartPay/${zarinpal_request.data.authority}`;

      return {
        result: zarinpal_request,
        htmlRedirect: `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>در حال انتقال...</title>
  <style>
    body { background: #121212; color: #fff; font-family: sans-serif; text-align: center; padding-top: 20vh; }
    a { color: #4da6ff; display: none; margin-top: 15px; text-decoration: none; font-size: 18px; }
  </style>
</head>
<body>
  <h2>در حال انتقال به درگاه پرداخت...</h2>
  <h1 id="timer">3</h1>
  <a id="btn" href="${PAYMENT_URL}">اگر منتقل نشدید اینجا کلیک کنید</a>

  <script>
    let url = "${PAYMENT_URL}";
    window.location.href = url;

    let t = 3;
    let i = setInterval(() => {
      document.getElementById('timer').innerText = --t;
      if (t <= 0) {
        clearInterval(i);
        document.getElementById('btn').style.display = 'inline-block';
      }
    }, 1000);
  </script>
</body>
</html>`};
    }

  }


  async verifyPayment(params) {

    const zarinpal_result = await fetch("https://" + this.mode + ".zarinpal.com/pg/v4/payment/verify.json", {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        merchant_id: this.params.merchantId,
        amount: params.amount,
        authority: params.authority,
      })
    }).then(res => res.json());


    return {
      success: zarinpal_result.data.code == "100" || zarinpal_result.data.code == "101"
      ,
      result: zarinpal_result
    };

  }
}
