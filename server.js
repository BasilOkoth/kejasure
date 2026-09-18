
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import multer from "multer";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import { initDb, q } from "./db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

app.use(helmet({contentSecurityPolicy:false, crossOriginResourcePolicy:{policy:"cross-origin"}}));
app.use(compression());
app.use(express.json({limit:"2mb"}));
app.use(cookieParser());
app.use(morgan("tiny"));
app.use(express.static(path.join(__dirname,"public")));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req,file,cb) => {
    const ok = file.mimetype.startsWith("image/") || file.mimetype.startsWith("video/");
    cb(ok ? null : new Error("Only image and video files are allowed."), ok);
  }
});

const cleanEmail = x => String(x||"").trim().toLowerCase();
const tokenFor = user => jwt.sign({id:user.id,role:user.role,email:user.email},JWT_SECRET,{expiresIn:"7d"});
const publicUser = u => ({id:u.id,name:u.name,email:u.email,phone:u.phone,role:u.role,verified_identity:u.verified_identity});

function auth(req,res,next){
  const raw = req.cookies.ks_token || (req.headers.authorization||"").replace(/^Bearer\s+/,"");
  if(!raw) return res.status(401).json({error:"Sign in required"});
  try { req.user = jwt.verify(raw,JWT_SECRET); next(); }
  catch { return res.status(401).json({error:"Session expired. Please sign in again."}); }
}
function admin(req,res,next){
  if(req.user?.role !== "admin") return res.status(403).json({error:"Admin access required"});
  next();
}
function roleAllowed(...roles){
  return (req,res,next) => roles.includes(req.user?.role) ? next() : res.status(403).json({error:"This account role cannot perform that action"});
}
function safetyCode(){ return crypto.randomBytes(3).toString("hex").toUpperCase(); }

async function ensureAdmin(){
  await q("UPDATE users SET name='KejaScan Admin' WHERE role='admin' AND name='KejaSure Admin'");
  const email = cleanEmail(process.env.ADMIN_EMAIL);
  const password = process.env.ADMIN_PASSWORD;
  if(!email || !password) return;
  const exists = await q("SELECT id FROM users WHERE email=$1",[email]);
  if(exists.rowCount) return;
  const hash = await bcrypt.hash(password,12);
  await q(`INSERT INTO users(name,email,password_hash,role,verified_identity)
           VALUES($1,$2,$3,'admin',true)`,["KejaScan Admin",email,hash]);
  console.log("Admin account created.");
}

app.get("/api/health",(req,res)=>res.json({ok:true,service:"KejaScan",time:new Date().toISOString()}));

app.post("/api/auth/register", async (req,res,next)=>{
  try{
    const {name,phone,password} = req.body||{};
    const email = cleanEmail(req.body?.email);
    const role = ["renter","landlord","caretaker","manager","agent","host"].includes(req.body?.role) ? req.body.role : "renter";
    if(!name || !email || !password || password.length < 8) return res.status(400).json({error:"Name, email and password of at least 8 characters are required"});
    const hash = await bcrypt.hash(password,12);
    const r = await q(`INSERT INTO users(name,email,phone,password_hash,role) VALUES($1,$2,$3,$4,$5) RETURNING *`,
      [name,email,phone||null,hash,role]);
    const user = r.rows[0];
    res.cookie("ks_token",tokenFor(user),{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",maxAge:7*24*3600*1000});
    res.status(201).json({user:publicUser(user)});
  }catch(e){
    if(e.code==="23505") return res.status(409).json({error:"An account with that email already exists"});
    next(e);
  }
});

app.post("/api/auth/login", async (req,res,next)=>{
  try{
    const email = cleanEmail(req.body?.email);
    const r = await q("SELECT * FROM users WHERE email=$1",[email]);
    if(!r.rowCount || !(await bcrypt.compare(String(req.body?.password||""),r.rows[0].password_hash)))
      return res.status(401).json({error:"Invalid email or password"});
    const user=r.rows[0];
    res.cookie("ks_token",tokenFor(user),{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",maxAge:7*24*3600*1000});
    res.json({user:publicUser(user)});
  }catch(e){ next(e); }
});
app.post("/api/auth/logout",(req,res)=>{res.clearCookie("ks_token");res.json({ok:true});});
app.get("/api/me",auth,async(req,res,next)=>{
  try{
    const r=await q("SELECT * FROM users WHERE id=$1",[req.user.id]);
    res.json({user:publicUser(r.rows[0])});
  }catch(e){next(e)}
});

const listingSelect = `
SELECT l.*, u.name AS lister_name, u.role AS lister_role, u.verified_identity AS lister_identity_verified,
       (SELECT id FROM media m WHERE m.listing_id=l.id AND m.media_type='image' ORDER BY m.id LIMIT 1) AS cover_media_id,
       (SELECT COUNT(*)::int FROM media m WHERE m.listing_id=l.id) AS media_count
FROM listings l JOIN users u ON u.id=l.owner_id`;

app.get("/api/listings", async(req,res,next)=>{
  try{
    const args=[]; const where=["l.status='verified'","(l.availability_expires_at IS NULL OR l.availability_expires_at > NOW())"];
    const add=(sql,val)=>{args.push(val);where.push(sql.replace("?","$"+args.length))};
    if(req.query.q) add(`(LOWER(l.title||' '||l.area||' '||l.county||' '||COALESCE(l.description,'')) LIKE ?)`,`%${String(req.query.q).toLowerCase()}%`);
    if(req.query.area) add("LOWER(l.area)=?",String(req.query.area).toLowerCase());
    if(req.query.type) add("LOWER(l.property_type)=?",String(req.query.type).toLowerCase());
    if(req.query.mode) add("l.listing_mode=?",String(req.query.mode));
    if(Number(req.query.maxRent)>0) {
      const budget=Number(req.query.maxRent);
      args.push(budget);
      where.push(`(
        (l.listing_mode='long_term' AND l.rent<=$${args.length})
        OR (l.listing_mode='short_stay' AND COALESCE(l.nightly_rate,0)<=$${args.length})
        OR (l.listing_mode='furnished_monthly' AND COALESCE(l.monthly_rate,l.rent)<=$${args.length})
      )`);
    }
    if(req.query.noViewingFee==="true") where.push("l.viewing_fee=0");
    const r=await q(`${listingSelect} WHERE ${where.join(" AND ")} ORDER BY l.verification_score DESC NULLS LAST,l.verified_at DESC`,args);
    res.json(r.rows);
  }catch(e){next(e)}
});
app.get("/api/listings/:id",async(req,res,next)=>{
  try{
    const r=await q(`${listingSelect} WHERE l.id=$1`,[req.params.id]);
    if(!r.rowCount) return res.status(404).json({error:"Listing not found"});
    const media=await q("SELECT id,media_type,content_type,filename FROM media WHERE listing_id=$1 ORDER BY id",[req.params.id]);
    res.json({...r.rows[0],media:media.rows});
  }catch(e){next(e)}
});

app.get("/api/listings/:id/scan",async(req,res,next)=>{
  try{
    const r=await q(`${listingSelect} WHERE l.id=$1`,[req.params.id]);
    if(!r.rowCount) return res.status(404).json({error:"Listing not found"});
    const x=r.rows[0];
    const now=Date.now();
    const confirmed=x.availability_confirmed_at?new Date(x.availability_confirmed_at).getTime():null;
    const freshHours=confirmed?Math.max(0,Math.round((now-confirmed)/3600000)):null;
    const availability = freshHours===null?40:freshHours<=24?100:freshHours<=72?92:freshHours<=168?80:55;
    const mediaCount=Number(x.media_count||0);
    const evidence=Math.min(100, mediaCount===0?30:mediaCount===1?62:mediaCount===2?78:90 + Math.min(10,mediaCount));
    let cost=55;
    if(x.listing_mode==='short_stay'){
      if(Number(x.nightly_rate)>0) cost+=20;
      if(x.cleaning_fee!==null) cost+=10;
      if(Number(x.minimum_nights||0)>0) cost+=8;
      if(x.security_deposit!==null) cost+=7;
    } else {
      if(Number(x.rent)>0) cost+=18;
      if(x.deposit!==null) cost+=10;
      if(x.service_charge!==null) cost+=9;
      if(x.viewing_fee!==null) cost+=8;
    }
    cost=Math.min(100,cost);
    let utilities=25;
    if(x.water) utilities+=25;
    if(x.internet) utilities+=25;
    if(x.security) utilities+=15;
    if(x.parking) utilities+=10;
    utilities=Math.min(100,utilities);
    let safety=30;
    if(x.lister_identity_verified) safety+=30;
    if(x.latitude!==null && x.longitude!==null) safety+=20;
    if(x.status==='verified') safety+=20;
    safety=Math.min(100,safety);
    let decision=45;
    if(x.description && x.description.length>40) decision+=15;
    if(x.bedrooms!==null) decision+=8;
    if(x.bathrooms!==null) decision+=8;
    if(x.floor) decision+=7;
    if(x.listing_mode==='short_stay' && x.maximum_guests) decision+=7;
    decision=Math.min(100,decision);
    const overall=Math.round(availability*.24 + evidence*.20 + cost*.16 + utilities*.14 + safety*.16 + decision*.10);
    const flags=[];
    if(freshHours===null) flags.push("Availability has not yet been reconfirmed.");
    else if(freshHours>72) flags.push("Availability confirmation is more than 72 hours old.");
    if(mediaCount<2) flags.push("Limited visual evidence uploaded.");
    if(!x.lister_identity_verified) flags.push("Lister identity is not yet verified.");
    if(x.latitude===null || x.longitude===null) flags.push("Exact map coordinates are not yet recorded.");
    if(!x.water) flags.push("Water reliability details are missing.");
    res.json({
      brand:"KejaScan",
      overall,
      fresh_hours:freshHours,
      dimensions:{availability,evidence,cost_clarity:cost,utilities,safety,decision_readiness:decision},
      flags,
      interpretation: overall>=90?"Excellent evidence and decision readiness":overall>=80?"Strong property intelligence":overall>=70?"Good, with a few checks remaining":"More evidence is recommended before travelling"
    });
  }catch(e){next(e)}
});

app.get("/api/media/:id",async(req,res,next)=>{
  try{
    const r=await q("SELECT content_type,filename,data FROM media WHERE id=$1",[req.params.id]);
    if(!r.rowCount) return res.status(404).end();
    res.setHeader("Content-Type",r.rows[0].content_type);
    res.setHeader("Cache-Control","public, max-age=86400");
    res.send(r.rows[0].data);
  }catch(e){next(e)}
});

app.post("/api/listings",auth,roleAllowed("landlord","caretaker","manager","agent","host"),async(req,res,next)=>{
  try{
    const b=req.body||{};
    if(!b.title||!b.area||!b.property_type) return res.status(400).json({error:"Title, area and property type are required"});
    if((b.listing_mode||"long_term")==="short_stay" && !Number(b.nightly_rate)) return res.status(400).json({error:"Nightly rate is required for short stays"});
    if((b.listing_mode||"long_term")!=="short_stay" && !Number(b.rent||b.monthly_rate)) return res.status(400).json({error:"Monthly rent is required"});
    const mode=["long_term","short_stay","furnished_monthly"].includes(b.listing_mode)?b.listing_mode:"long_term";
    const effectiveRent = mode==="short_stay"
      ? Number(b.monthly_rate||b.rent||0)
      : Number(b.rent||b.monthly_rate||0);
    const r=await q(`INSERT INTO listings
      (owner_id,title,area,county,property_type,bedrooms,bathrooms,rent,deposit,service_charge,viewing_fee,units_available,
       description,water,internet,security,parking,floor,latitude,longitude,listing_mode,nightly_rate,weekly_rate,monthly_rate,
       cleaning_fee,security_deposit,minimum_nights,maximum_guests,check_in_time,check_out_time,furnished,self_check_in,kitchen,workspace,pool,gym)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36)
      RETURNING *`,
      [req.user.id,b.title,b.area,b.county||"Nairobi",b.property_type,Number(b.bedrooms||0),Number(b.bathrooms||1),
       effectiveRent,Number(b.deposit||0),Number(b.service_charge||0),Number(b.viewing_fee||0),Number(b.units_available||1),
       b.description||null,b.water||null,b.internet||null,b.security||null,!!b.parking,b.floor||null,
       b.latitude?Number(b.latitude):null,b.longitude?Number(b.longitude):null,mode,
       b.nightly_rate?Number(b.nightly_rate):null,b.weekly_rate?Number(b.weekly_rate):null,b.monthly_rate?Number(b.monthly_rate):null,
       Number(b.cleaning_fee||0),Number(b.security_deposit||0),Number(b.minimum_nights||1),
       b.maximum_guests?Number(b.maximum_guests):null,b.check_in_time||null,b.check_out_time||null,
       !!b.furnished,!!b.self_check_in,!!b.kitchen,!!b.workspace,!!b.pool,!!b.gym]);
    res.status(201).json({message:"Property submitted. Add current photos/video, then send it for verification.",listing:r.rows[0]});
  }catch(e){next(e)}
});

app.post("/api/listings/:id/media",auth,upload.single("file"),async(req,res,next)=>{
  try{
    const own=await q("SELECT owner_id,status FROM listings WHERE id=$1",[req.params.id]);
    if(!own.rowCount) return res.status(404).json({error:"Listing not found"});
    if(Number(own.rows[0].owner_id)!==Number(req.user.id) && req.user.role!=="admin") return res.status(403).json({error:"Not your listing"});
    if(!req.file) return res.status(400).json({error:"Choose an image or video"});
    const type=req.file.mimetype.startsWith("video/")?"video":"image";
    const r=await q(`INSERT INTO media(listing_id,uploader_id,media_type,content_type,filename,data)
      VALUES($1,$2,$3,$4,$5,$6) RETURNING id,media_type,content_type,filename`,
      [req.params.id,req.user.id,type,req.file.mimetype,req.file.originalname,req.file.buffer]);
    res.status(201).json({media:r.rows[0]});
  }catch(e){next(e)}
});

app.post("/api/listings/:id/reconfirm",auth,async(req,res,next)=>{
  try{
    const r=await q(`UPDATE listings SET units_available=$1,availability_confirmed_at=NOW(),
      availability_expires_at=NOW()+INTERVAL '7 days',updated_at=NOW()
      WHERE id=$2 AND (owner_id=$3 OR $4='admin') RETURNING *`,
      [Math.max(0,Number(req.body?.units_available||0)),req.params.id,req.user.id,req.user.role]);
    if(!r.rowCount) return res.status(404).json({error:"Listing not found or not yours"});
    res.json({message:"Availability confirmed for 7 days.",listing:r.rows[0]});
  }catch(e){next(e)}
});

app.get("/api/dashboard/listings",auth,roleAllowed("landlord","caretaker","manager","agent","host","admin"),async(req,res,next)=>{
  try{
    const r = req.user.role==="admin"
      ? await q(`${listingSelect} ORDER BY l.created_at DESC`)
      : await q(`${listingSelect} WHERE l.owner_id=$1 ORDER BY l.created_at DESC`,[req.user.id]);
    res.json(r.rows);
  }catch(e){next(e)}
});


app.get("/api/admin/overview",auth,admin,async(req,res,next)=>{
  try{
    const [users,listings,bookings,recentUsers,recentListings] = await Promise.all([
      q(`SELECT
        COUNT(*)::int AS total_users,
        COUNT(*) FILTER(WHERE role='renter')::int AS renters,
        COUNT(*) FILTER(WHERE role IN ('landlord','caretaker','manager','agent','host'))::int AS property_partners,
        COUNT(*) FILTER(WHERE role='admin')::int AS admins,
        COUNT(*) FILTER(WHERE verified_identity=true)::int AS identity_verified
        FROM users`),
      q(`SELECT
        COUNT(*)::int AS total_properties,
        COUNT(*) FILTER(WHERE status='pending')::int AS pending,
        COUNT(*) FILTER(WHERE status='verified')::int AS verified,
        COUNT(*) FILTER(WHERE status='rejected')::int AS rejected,
        COUNT(*) FILTER(WHERE status='paused')::int AS paused,
        COUNT(*) FILTER(WHERE status='occupied')::int AS occupied,
        COALESCE(SUM(units_available) FILTER(WHERE status='verified'),0)::int AS live_units,
        COUNT(*) FILTER(WHERE status='verified' AND availability_expires_at IS NOT NULL AND availability_expires_at <= NOW()+INTERVAL '48 hours')::int AS expiring_soon
        FROM listings`),
      q(`SELECT
        COUNT(*)::int AS total_bookings,
        COUNT(*) FILTER(WHERE status='requested')::int AS requested,
        COUNT(*) FILTER(WHERE status='confirmed')::int AS confirmed,
        COUNT(*) FILTER(WHERE status='completed')::int AS completed,
        COUNT(*) FILTER(WHERE status='cancelled')::int AS cancelled
        FROM bookings`),
      q(`SELECT id,name,email,phone,role,verified_identity,created_at
         FROM users ORDER BY created_at DESC LIMIT 8`),
      q(`${listingSelect} ORDER BY l.created_at DESC LIMIT 8`)
    ]);
    res.json({
      users: users.rows[0],
      listings: listings.rows[0],
      bookings: bookings.rows[0],
      recent_users: recentUsers.rows,
      recent_listings: recentListings.rows
    });
  }catch(e){next(e)}
});

app.get("/api/admin/users",auth,admin,async(req,res,next)=>{
  try{
    const role = String(req.query.role||"").trim();
    const search = String(req.query.q||"").trim().toLowerCase();
    const params=[]; const where=[];
    if(role){params.push(role);where.push(`role=$${params.length}`)}
    if(search){params.push(`%${search}%`);where.push(`(LOWER(name) LIKE $${params.length} OR LOWER(email) LIKE $${params.length} OR LOWER(COALESCE(phone,'')) LIKE $${params.length})`)}
    const sql=`SELECT id,name,email,phone,role,verified_identity,created_at
               FROM users ${where.length?'WHERE '+where.join(' AND '):''}
               ORDER BY created_at DESC LIMIT 200`;
    const r=await q(sql,params);
    res.json(r.rows);
  }catch(e){next(e)}
});

app.get("/api/admin/bookings",auth,admin,async(req,res,next)=>{
  try{
    const r=await q(`SELECT b.*,l.title,l.area,l.rent,
      u.name AS renter_name,u.email AS renter_email,u.phone AS renter_phone,
      owner.name AS lister_name,owner.role AS lister_role
      FROM bookings b
      JOIN listings l ON l.id=b.listing_id
      JOIN users u ON u.id=b.renter_id
      JOIN users owner ON owner.id=l.owner_id
      ORDER BY b.created_at DESC LIMIT 200`);
    res.json(r.rows);
  }catch(e){next(e)}
});

app.post("/api/admin/listings/:id/pause",auth,admin,async(req,res,next)=>{
  try{
    const r=await q(`UPDATE listings SET status='paused',updated_at=NOW()
      WHERE id=$1 RETURNING *`,[req.params.id]);
    if(!r.rowCount) return res.status(404).json({error:"Listing not found"});
    res.json({message:"Listing paused.",listing:r.rows[0]});
  }catch(e){next(e)}
});

app.post("/api/admin/listings/:id/score",auth,admin,async(req,res,next)=>{
  try{
    const score=Math.min(100,Math.max(1,Number(req.body?.score||85)));
    const r=await q(`UPDATE listings SET verification_score=$1,updated_at=NOW()
      WHERE id=$2 RETURNING *`,[score,req.params.id]);
    if(!r.rowCount) return res.status(404).json({error:"Listing not found"});
    res.json({message:"KejaScan Score updated.",listing:r.rows[0]});
  }catch(e){next(e)}
});

app.post("/api/admin/users/:id/unverify-identity",auth,admin,async(req,res,next)=>{
  try{
    const r=await q("UPDATE users SET verified_identity=false WHERE id=$1 RETURNING id,name,email,role,verified_identity",[req.params.id]);
    if(!r.rowCount) return res.status(404).json({error:"User not found"});
    res.json({user:r.rows[0]});
  }catch(e){next(e)}
});

app.post("/api/admin/listings/:id/verify",auth,admin,async(req,res,next)=>{
  try{
    const score=Math.min(100,Math.max(1,Number(req.body?.score||85)));
    const r=await q(`UPDATE listings SET status='verified',verification_score=$1,verified_at=NOW(),
      availability_confirmed_at=NOW(),availability_expires_at=NOW()+INTERVAL '7 days',rejection_reason=NULL,updated_at=NOW()
      WHERE id=$2 RETURNING *`,[score,req.params.id]);
    res.json({message:"Listing verified.",listing:r.rows[0]});
  }catch(e){next(e)}
});
app.post("/api/admin/listings/:id/reject",auth,admin,async(req,res,next)=>{
  try{
    const r=await q(`UPDATE listings SET status='rejected',rejection_reason=$1,updated_at=NOW() WHERE id=$2 RETURNING *`,
      [String(req.body?.reason||"Verification requirements not met"),req.params.id]);
    res.json({message:"Listing rejected.",listing:r.rows[0]});
  }catch(e){next(e)}
});
app.post("/api/admin/users/:id/verify-identity",auth,admin,async(req,res,next)=>{
  try{
    const r=await q("UPDATE users SET verified_identity=true WHERE id=$1 RETURNING id,name,email,role,verified_identity",[req.params.id]);
    res.json({user:r.rows[0]});
  }catch(e){next(e)}
});

app.post("/api/listings/:id/bookings",auth,roleAllowed("renter"),async(req,res,next)=>{
  try{
    if(!req.body?.scheduled_for) return res.status(400).json({error:"Choose a viewing time"});
    const listing=await q("SELECT id,status FROM listings WHERE id=$1",[req.params.id]);
    if(!listing.rowCount||listing.rows[0].status!=="verified") return res.status(400).json({error:"Only verified homes can be booked"});
    const r=await q(`INSERT INTO bookings(listing_id,renter_id,scheduled_for,meeting_note,safety_code)
      VALUES($1,$2,$3,$4,$5) RETURNING *`,
      [req.params.id,req.user.id,req.body.scheduled_for,req.body.meeting_note||null,safetyCode()]);
    res.status(201).json({message:"Viewing request created. Keep the safety code private until you meet the verified lister.",booking:r.rows[0]});
  }catch(e){next(e)}
});
app.get("/api/bookings",auth,async(req,res,next)=>{
  try{
    const r = req.user.role==="renter"
      ? await q(`SELECT b.*,l.title,l.area FROM bookings b JOIN listings l ON l.id=b.listing_id WHERE b.renter_id=$1 ORDER BY b.scheduled_for DESC`,[req.user.id])
      : await q(`SELECT b.*,l.title,l.area,u.name AS renter_name,u.phone AS renter_phone FROM bookings b JOIN listings l ON l.id=b.listing_id JOIN users u ON u.id=b.renter_id WHERE l.owner_id=$1 ORDER BY b.scheduled_for DESC`,[req.user.id]);
    res.json(r.rows);
  }catch(e){next(e)}
});
app.post("/api/bookings/:id/status",auth,async(req,res,next)=>{
  try{
    const status=["confirmed","completed","cancelled"].includes(req.body?.status)?req.body.status:null;
    if(!status) return res.status(400).json({error:"Invalid booking status"});
    const r=await q(`UPDATE bookings b SET status=$1 FROM listings l
      WHERE b.id=$2 AND b.listing_id=l.id AND (l.owner_id=$3 OR $4='admin') RETURNING b.*`,
      [status,req.params.id,req.user.id,req.user.role]);
    if(!r.rowCount) return res.status(403).json({error:"Not allowed"});
    res.json({booking:r.rows[0]});
  }catch(e){next(e)}
});

app.post("/api/listings/:id/save",auth,roleAllowed("renter"),async(req,res,next)=>{
  try{
    await q(`INSERT INTO saved_listings(user_id,listing_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[req.user.id,req.params.id]);
    res.json({ok:true});
  }catch(e){next(e)}
});
app.delete("/api/listings/:id/save",auth,roleAllowed("renter"),async(req,res,next)=>{
  try{
    await q("DELETE FROM saved_listings WHERE user_id=$1 AND listing_id=$2",[req.user.id,req.params.id]);
    res.json({ok:true});
  }catch(e){next(e)}
});
app.get("/api/saved",auth,roleAllowed("renter"),async(req,res,next)=>{
  try{
    const r=await q(`${listingSelect} JOIN saved_listings s ON s.listing_id=l.id WHERE s.user_id=$1 ORDER BY s.created_at DESC`,[req.user.id]);
    res.json(r.rows);
  }catch(e){next(e)}
});

app.post("/api/assistant",async(req,res,next)=>{
  try{
    const text=String(req.body?.message||"").toLowerCase();
    const r=await q(`${listingSelect} WHERE l.status='verified' AND (l.availability_expires_at IS NULL OR l.availability_expires_at>NOW())`);
    let rows=r.rows;
    const wantsShort=/short stay|airbnb|nightly|holiday home|serviced apartment/.test(text);
    const wantsFurnishedMonthly=/furnished monthly|monthly furnished/.test(text);
    if(wantsShort) rows=rows.filter(x=>x.listing_mode==="short_stay");
    if(wantsFurnishedMonthly) rows=rows.filter(x=>x.listing_mode==="furnished_monthly");

    const budget=text.match(/(?:under|below|max|budget)\s*(?:ksh|kes)?\s*([0-9,.]+)\s*k?/i);
    if(budget){let n=Number(budget[1].replace(/,/g,""));if(/\bk\b/i.test(budget[0])&&n<1000)n*=1000;rows=rows.filter(x=>{
      const price=x.listing_mode==="short_stay"?Number(x.nightly_rate||0):x.listing_mode==="furnished_monthly"?Number(x.monthly_rate||x.rent||0):Number(x.rent||0);
      return price<=n;
    })}
    const areas=[...new Set(rows.map(x=>x.area))]; const area=areas.find(a=>text.includes(a.toLowerCase())); if(area)rows=rows.filter(x=>x.area===area);
    if(/bedsitter/.test(text))rows=rows.filter(x=>/bedsitter/i.test(x.property_type));
    if(/1\s*bed|one bedroom|1br/.test(text))rows=rows.filter(x=>Number(x.bedrooms)===1);
    if(/2\s*bed|two bedroom|2br/.test(text))rows=rows.filter(x=>Number(x.bedrooms)===2);
    if(/parking/.test(text))rows=rows.filter(x=>x.parking);
    if(/fibre|fiber|internet/.test(text))rows=rows.filter(x=>/fibre|fiber|faiba|isp/i.test(x.internet||""));
    rows.sort((a,b)=>(b.verification_score||0)-(a.verification_score||0));
    res.json({summary:rows.length?`I found ${Math.min(rows.length,5)} strong verified matches.`:"No current verified match. Try a wider area or budget.",matches:rows.slice(0,5)});
  }catch(e){next(e)}
});

app.get("/api/stats",async(req,res,next)=>{
  try{
    const r=await q(`SELECT
      COUNT(*) FILTER(WHERE status='verified')::int AS verified,
      COALESCE(SUM(units_available) FILTER(WHERE status='verified'),0)::int AS live_units,
      COALESCE(ROUND(AVG(verification_score) FILTER(WHERE status='verified')),0)::int AS avg_score
      FROM listings`);
    res.json(r.rows[0]);
  }catch(e){next(e)}
});

app.use((err,req,res,next)=>{
  console.error(err);
  if(err instanceof multer.MulterError) return res.status(400).json({error:err.message});
  res.status(500).json({error:err.message||"Server error"});
});
app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));

await initDb();
await ensureAdmin();
app.listen(PORT,()=>console.log(`KejaScan running on ${PORT}`));
