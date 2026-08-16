import { getHongKongStayQuote } from "../lib/booking-db-hk.mjs";
const send=(res,status,body)=>{res.status(status).setHeader("Content-Type","application/json");res.setHeader("Cache-Control","no-store");res.end(JSON.stringify(body));};
export default async function handler(req,res){
  if(req.method!=="GET") return send(res,405,{error:"Method not allowed."});
  const roomId=String(req.query?.roomId||""),checkin=String(req.query?.checkin||""),checkout=String(req.query?.checkout||"");
  if(!["hk-standard","hk-extended"].includes(roomId)) return send(res,400,{error:"Invalid rate plan."});
  if(!/^\d{4}-\d{2}-\d{2}$/.test(checkin)||!/^\d{4}-\d{2}-\d{2}$/.test(checkout)) return send(res,400,{error:"Invalid dates."});
  const nights=Math.round((new Date(`${checkout}T00:00:00Z`)-new Date(`${checkin}T00:00:00Z`))/86400000);
  if(nights<1||nights>90) return send(res,400,{error:"Stays must be 1–90 nights."});
  try{return send(res,200,await getHongKongStayQuote({roomId,checkin,checkout}));}catch(error){console.error("HK availability failed",error);return send(res,503,{error:"Availability is temporarily unavailable."});}
}
