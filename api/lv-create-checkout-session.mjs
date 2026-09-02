import crypto from "node:crypto";
import { attachLasVegasStripeSession,getLasVegasStayQuote,holdLasVegasStay,releaseLasVegasHold } from "../lib/booking-db-lv.mjs";
const send=(res,status,body)=>{res.status(status).setHeader("Content-Type","application/json");res.setHeader("Cache-Control","no-store");res.end(JSON.stringify(body));};
export default async function handler(req,res){
  if(req.method!=="POST")return send(res,405,{error:"Method not allowed."});
  if(!process.env.STRIPE_SECRET_KEY||!process.env.DATABASE_URL)return send(res,503,{error:"Secure booking is not configured."});
  let body;try{body=typeof req.body==="string"?JSON.parse(req.body):req.body;}catch{return send(res,400,{error:"Invalid request."});}
  const checkin=String(body?.checkin||""),checkout=String(body?.checkout||""),guests=Number(body?.guests),roomId=String(body?.roomId||"");
  const nights=Math.round((new Date(`${checkout}T00:00:00Z`)-new Date(`${checkin}T00:00:00Z`))/86400000);
  if(roomId!=="lv-standard"||nights<1||nights>90||!Number.isInteger(guests)||guests<1||guests>4)return send(res,400,{error:"Please review the stay, dates, and guests."});
  const host=String(req.headers["x-forwarded-host"]||req.headers.host||"").split(",")[0].trim().toLowerCase();
  if(!(["anfustay.com","www.anfustay.com"].includes(host)||host.endsWith(".vercel.app")||host.startsWith("localhost")))return send(res,400,{error:"Invalid booking origin."});
  const baseUrl=`${host.startsWith("localhost")?"http":"https"}://${host}`,holdId=crypto.randomUUID();
  try{
    const quote=await getLasVegasStayQuote({roomId,checkin,checkout,discountPercent:nights>=7?15:0});if(!quote.available)return send(res,409,{error:"Those dates are no longer available."});
    if(!await holdLasVegasStay({holdId,checkin,checkout}))return send(res,409,{error:"Those dates were just reserved."});
    const p=new URLSearchParams({mode:"payment",locale:"auto",customer_creation:"always",success_url:`${baseUrl}/las-vegas/booking/success.html?session_id={CHECKOUT_SESSION_ID}`,cancel_url:`${baseUrl}/las-vegas/?checkout=cancelled`});
    p.set("phone_number_collection[enabled]","true");p.set("line_items[0][quantity]","1");p.set("line_items[0][price_data][currency]","usd");p.set("line_items[0][price_data][unit_amount]",String(quote.accommodationTotalUsd*100));p.set("line_items[0][price_data][product_data][name]","Anfu Residence · Las Vegas");p.set("line_items[0][price_data][product_data][description]",`${checkin} to ${checkout} · ${guests} guest${guests===1?"":"s"}`);
    if(quote.cleaningFeeUsd>0){p.set("line_items[1][quantity]","1");p.set("line_items[1][price_data][currency]","usd");p.set("line_items[1][price_data][unit_amount]",String(quote.cleaningFeeUsd*100));p.set("line_items[1][price_data][product_data][name]","Cleaning fee");}
    Object.entries({location:"las_vegas",room_id:roomId,checkin,checkout,nights:String(nights),guests:String(guests),hold_id:holdId}).forEach(([k,v])=>p.set(`metadata[${k}]`,v));
    const stripe=await fetch("https://api.stripe.com/v1/checkout/sessions",{method:"POST",headers:{Authorization:`Bearer ${process.env.STRIPE_SECRET_KEY}`,"Content-Type":"application/x-www-form-urlencoded","Stripe-Version":"2026-02-25.clover"},body:p});
    const session=await stripe.json();if(!stripe.ok||!session.url){await releaseLasVegasHold(holdId);return send(res,502,{error:"Unable to start secure payment."});}
    await attachLasVegasStripeSession(holdId,session.id);return send(res,200,{url:session.url});
  }catch(error){await releaseLasVegasHold(holdId).catch(()=>{});console.error("LV checkout failed",error);return send(res,502,{error:"Unable to reach secure payment."});}
}
