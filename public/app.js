const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
let me=null, map=null;
const money=n=>`KSh ${Number(n||0).toLocaleString()}`;
const stayPrice=x=>x.listing_mode==="short_stay"
  ? `${money(x.nightly_rate)} / night`
  : x.listing_mode==="furnished_monthly"
    ? `${money(x.monthly_rate||x.rent)} / month`
    : `${money(x.rent)} / month`;
const stayLabel=x=>x.listing_mode==="short_stay"?"Airbnb / Short stay":x.listing_mode==="furnished_monthly"?"Furnished monthly":"Long-term";
const api=async(url,opt={})=>{const r=await fetch(url,{credentials:"same-origin",...opt,headers:{"Content-Type":"application/json",...(opt.headers||{})}});let d={};try{d=await r.json()}catch{}if(!r.ok)throw new Error(d.error||"Request failed");return d};
function open(id){$("#"+id).classList.add("open")} function close(el){el.closest(".modal").classList.remove("open")}
$$("[data-close]").forEach(b=>b.onclick=()=>close(b)); $$(".modal").forEach(m=>m.onclick=e=>{if(e.target===m)m.classList.remove("open")});

async function getMe(){try{me=(await api("/api/me")).user}catch{me=null} $("#authBtn").textContent=me?me.name.split(" ")[0]:"Sign in";return me}
async function stats(){const s=await api("/api/stats");$("#s1").textContent=s.verified;$("#s2").textContent=s.live_units;$("#s3").textContent=`${s.avg_score}/100`}
async function load(){
 const p=new URLSearchParams();if($("#q").value)p.set("q",$("#q").value);if($("#budget").value)p.set("maxRent",$("#budget").value);if($("#ptype").value)p.set("type",$("#ptype").value);if($("#modeFilter")?.value)p.set("mode",$("#modeFilter").value);if($("#freeView").checked)p.set("noViewingFee","true");
 const rows=await api("/api/listings?"+p);render(rows)
}
function render(rows){
 $("#count").textContent=`${rows.length} verified match${rows.length===1?"":"es"}`;
 $("#grid").innerHTML=rows.length?rows.map(x=>`<article class="card" data-id="${x.id}"><div class="photo">${x.cover_media_id?`<img src="/api/media/${x.cover_media_id}" alt="${x.title}">`:`<div class="noimg">Verified media coming soon</div>`}<span class="score">${x.verification_score||"—"} / 100</span></div><div class="body"><div class="bodyTop"><h3>${x.title}</h3><span class="price">${stayPrice(x)}</span></div><div class="meta">✓ Verified • ${stayLabel(x)} • ${x.area} • ${x.units_available} available</div><div class="badges"><span class="badge">${x.viewing_fee===0?"No viewing fee":"Viewing "+money(x.viewing_fee)}</span>${x.internet?`<span class="badge">${x.internet}</span>`:""}${x.parking?`<span class="badge">Parking</span>`:""}</div><div class="cost"><span>${x.listing_mode==="short_stay"
  ? `From <b>${money(x.nightly_rate)}</b> / night${Number(x.cleaning_fee)>0?` + ${money(x.cleaning_fee)} cleaning`:""}`
  : `Move-in from <b>${money(Number(x.rent)+Number(x.deposit)+Number(x.service_charge))}</b>`}</span><span>${x.media_count} media</span></div></div></article>`).join(""):`<div class="empty">No current verified homes match those filters.</div>`;
 $$(".card").forEach(c=>c.onclick=()=>detail(c.dataset.id))
}
window.detail=async function detail(id){
 const [x,scan]=await Promise.all([api("/api/listings/"+id),api(`/api/listings/${id}/scan`)]);const first=x.media?.[0];const media=first?(first.media_type==="video"?`<video controls src="/api/media/${first.id}"></video>`:`<img src="/api/media/${first.id}" alt="">`):`<div class="noimg">No media uploaded yet</div>`;
 $("#detail").innerHTML=`<div class="detailHero"><div class="gallery">${media}</div><div><span class="kicker">Verified listing</span><div class="detailScore">${x.verification_score||"—"}</div><small>VERIFICATION SCORE</small><h2>${x.title}</h2><p>${x.description||""}</p><h3>${stayPrice(x)}</h3></div></div><div class="info"><div><span>Availability</span><b>${x.units_available} unit(s) vacant</b></div><div><span>Viewing fee</span><b>${money(x.viewing_fee)}</b></div><div><span>Deposit</span><b>${money(x.deposit)}</b></div><div><span>Service charge</span><b>${money(x.service_charge)}</b></div><div><span>Water</span><b>${x.water||"Not stated"}</b></div><div><span>Internet</span><b>${x.internet||"Not stated"}</b></div><div><span>Security</span><b>${x.security||"Not stated"}</b></div><div><span>Lister</span><b>${x.lister_name} • ${x.lister_role}${x.lister_identity_verified?" ✓":""}</b></div>${x.listing_mode==="short_stay"?`
      <div><span>Weekly rate</span><b>${x.weekly_rate?money(x.weekly_rate):"Not stated"}</b></div>
      <div><span>Cleaning fee</span><b>${money(x.cleaning_fee)}</b></div>
      <div><span>Minimum stay</span><b>${x.minimum_nights||1} night(s)</b></div>
      <div><span>Maximum guests</span><b>${x.maximum_guests||"Not stated"}</b></div>
      <div><span>Check-in</span><b>${x.check_in_time||"Not stated"}</b></div>
      <div><span>Check-out</span><b>${x.check_out_time||"Not stated"}</b></div>
      <div><span>Self check-in</span><b>${x.self_check_in?"Yes":"No"}</b></div>
      <div><span>Amenities</span><b>${[x.kitchen&&"Kitchen",x.workspace&&"Workspace",x.pool&&"Pool",x.gym&&"Gym"].filter(Boolean).join(" • ")||"Not stated"}</b></div>`:""}</div>
      <section class="scanReport"><div class="scanReportHead"><div><span class="kicker">KejaScan property scan</span><h3>${scan.overall}/100 • ${scan.interpretation}</h3></div><div class="scanFresh">${scan.fresh_hours===null?"Freshness unknown":scan.fresh_hours+"h since availability check"}</div></div>
      <div class="scanBars">${Object.entries(scan.dimensions).map(([k,v])=>`<div class="scanBar"><div><span>${k.replaceAll("_"," ")}</span><b>${v}</b></div><i><em style="width:${v}%"></em></i></div>`).join("")}</div>
      ${scan.flags.length?`<div class="scanFlags"><b>Check before you go</b>${scan.flags.map(f=>`<span>• ${f}</span>`).join("")}</div>`:`<div class="scanFlags clear"><b>No major information gaps detected.</b></div>`}</section>
      <div class="actions"><button onclick="saveHome(${x.id})">Save</button>${x.latitude&&x.longitude?`<button onclick="showMap(${x.latitude},${x.longitude},'${x.title.replaceAll("'","")}')">Map</button>`:""}<button class="go" onclick="bookHome(${x.id})">Book verified viewing</button></div>`;open("detailModal")
}
window.saveHome=async id=>{if(!me){open("authModal");return}try{await api(`/api/listings/${id}/save`,{method:"POST"});alert("Saved to your KejaScan account.")}catch(e){alert(e.message)}}
window.bookHome=async id=>{if(!me){open("authModal");return}if(me.role!=="renter"){alert("Viewing bookings are for house-seeker accounts.");return}const when=prompt("Enter viewing date/time, e.g. 2026-09-20T14:00");if(!when)return;try{const r=await api(`/api/listings/${id}/bookings`,{method:"POST",body:JSON.stringify({scheduled_for:when})});alert(`${r.message}\nSafety code: ${r.booking.safety_code}`)}catch(e){alert(e.message)}}
window.showMap=(lat,lng,title)=>{open("mapModal");setTimeout(()=>{if(map)map.remove();map=L.map("map").setView([lat,lng],15);L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{attribution:"© OpenStreetMap"}).addTo(map);L.marker([lat,lng]).addTo(map).bindPopup(title).openPopup()},100)}
$("#searchBtn").onclick=load;$("#budget").onchange=load;$("#ptype").onchange=load;if($("#modeFilter"))$("#modeFilter").onchange=load;$("#freeView").onchange=load;$("#q").onkeydown=e=>{if(e.key==="Enter")load()};
$("#askBtn").onclick=async()=>{const t=$("#ask").value.trim();if(!t)return;$("#askBtn").textContent="Searching…";try{const r=await api("/api/assistant",{method:"POST",body:JSON.stringify({message:t})});render(r.matches);$("#homes").scrollIntoView({behavior:"smooth"})}catch(e){alert(e.message)}finally{$("#askBtn").textContent="Find it"}};
$("#authBtn").onclick=()=>me?dashboard():open("authModal");$("#dashboardBtn").onclick=dashboard;
$$(".tab").forEach(t=>t.onclick=()=>{$$(".tab").forEach(x=>x.classList.remove("active"));t.classList.add("active");$("#loginForm").hidden=t.dataset.tab!=="login";$("#registerForm").hidden=t.dataset.tab!=="register"});
$("#loginForm").onsubmit=async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));try{me=(await api("/api/auth/login",{method:"POST",body:JSON.stringify(f)})).user;$("#authModal").classList.remove("open");await getMe();dashboard()}catch(x){$("#authMsg").textContent=x.message}};
$("#registerForm").onsubmit=async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));try{me=(await api("/api/auth/register",{method:"POST",body:JSON.stringify(f)})).user;$("#authModal").classList.remove("open");await getMe();dashboard()}catch(x){$("#authMsg").textContent=x.message}};

async function dashboard(){
 if(!me){open("authModal");return}
 open("dashboardModal");let html=`<div class="dashHead"><div><span class="kicker">${me.role}</span><h2>${me.name}</h2></div><button class="quiet" id="logout">Sign out</button></div>`;
 if(["landlord","caretaker","manager","agent","host"].includes(me.role)){const rows=await api("/api/dashboard/listings");html+=`<h3 style="margin-top:25px">Your properties</h3><button class="primary" id="newListing">+ Add property</button><div class="dashList">${rows.map(x=>`<div class="dashItem"><h3>${x.title}</h3><span class="status ${x.status}">${x.status}</span><p>${x.area} • ${money(x.rent)} • ${x.units_available} vacant • ${x.media_count} media</p><div class="actions"><button onclick="reconfirm(${x.id},${x.units_available})">Reconfirm availability</button><label class="uploadBox">Add photo/video<input type="file" hidden onchange="uploadMedia(event,${x.id})"></label></div></div>`).join("")||"<p>No property submitted yet.</p>"}</div><div id="newBox"></div>`}
 else if(me.role==="admin"){
   const [overview,rows,users,bookings]=await Promise.all([
     api("/api/admin/overview"),
     api("/api/dashboard/listings"),
     api("/api/admin/users"),
     api("/api/admin/bookings")
   ]);
   const pending=rows.filter(x=>x.status==="pending");
   const expiring=rows.filter(x=>x.status==="verified" && x.availability_expires_at && new Date(x.availability_expires_at)-Date.now() < 48*3600*1000);
   html+=`
   <div class="adminWelcome">
     <div><span class="kicker">Platform control centre</span><h2>KejaScan Admin</h2><p>Verification, users, live inventory and viewing activity in one place.</p></div>
     <div class="adminQuick"><button onclick="adminRefresh()">↻ Refresh</button></div>
   </div>
   <div class="adminStats">
     <article><span>Pending verification</span><b>${overview.listings.pending}</b><small>Properties awaiting review</small></article>
     <article><span>Verified homes</span><b>${overview.listings.verified}</b><small>${overview.listings.live_units} live vacant units</small></article>
     <article><span>Total users</span><b>${overview.users.total_users}</b><small>${overview.users.renters} house seekers</small></article>
     <article><span>Property partners</span><b>${overview.users.property_partners}</b><small>Landlords, caretakers, managers & agents</small></article>
     <article><span>Viewing requests</span><b>${overview.bookings.requested}</b><small>${overview.bookings.total_bookings} total appointments</small></article>
     <article><span>Expiring soon</span><b>${overview.listings.expiring_soon}</b><small>Need availability reconfirmation</small></article>
   </div>

   <div class="adminTabs">
     <button class="adminTab active" data-admin-view="queue">Verification queue <span>${pending.length}</span></button>
     <button class="adminTab" data-admin-view="listings">All listings <span>${rows.length}</span></button>
     <button class="adminTab" data-admin-view="users">Users <span>${users.length}</span></button>
     <button class="adminTab" data-admin-view="bookings">Viewings <span>${bookings.length}</span></button>
     <button class="adminTab" data-admin-view="attention">Needs attention <span>${expiring.length}</span></button>
   </div>

   <div id="adminQueue" class="adminPanel">
     <div class="panelHead"><div><span class="kicker">Verification queue</span><h3>Properties awaiting approval</h3></div></div>
     ${pending.length?`<div class="adminCards">${pending.map(adminListingCard).join("")}</div>`:`<div class="adminEmpty"><b>Queue clear</b><p>No properties are waiting for verification.</p></div>`}
   </div>

   <div id="adminListings" class="adminPanel" hidden>
     <div class="panelHead"><div><span class="kicker">Inventory</span><h3>All property records</h3></div></div>
     <div class="adminTableWrap"><table class="adminTable"><thead><tr><th>Property</th><th>Lister</th><th>Status</th><th>Rent</th><th>Vacant</th><th>Score</th><th>Media</th><th>Actions</th></tr></thead><tbody>
     ${rows.map(x=>`<tr><td><b>${x.title}</b><small>${stayLabel(x)} • ${x.area}</small></td><td>${x.lister_name}<small>${x.lister_role}${x.lister_identity_verified?" • ID ✓":""}</small></td><td><span class="status ${x.status}">${x.status}</span></td><td>${stayPrice(x)}</td><td>${x.units_available}</td><td>${x.verification_score||"—"}</td><td>${x.media_count}</td><td><div class="tableActions"><button onclick="detail(${x.id})">View</button><button onclick="adminScore(${x.id},${x.verification_score||85})">Score</button>${x.status==="verified"?`<button onclick="adminPause(${x.id})">Pause</button>`:""}</div></td></tr>`).join("")}
     </tbody></table></div>
   </div>

   <div id="adminUsers" class="adminPanel" hidden>
     <div class="panelHead"><div><span class="kicker">People</span><h3>Users & listers</h3></div><input id="adminUserSearch" class="adminSearch" placeholder="Search name, email or phone"></div>
     <div id="adminUserList" class="adminCards">${users.map(adminUserCard).join("")}</div>
   </div>

   <div id="adminBookings" class="adminPanel" hidden>
     <div class="panelHead"><div><span class="kicker">Viewing activity</span><h3>Recent appointments</h3></div></div>
     ${bookings.length?`<div class="adminTableWrap"><table class="adminTable"><thead><tr><th>Property</th><th>House seeker</th><th>Scheduled</th><th>Status</th><th>Safety code</th></tr></thead><tbody>${bookings.map(b=>`<tr><td><b>${b.title}</b><small>${b.area}</small></td><td>${b.renter_name}<small>${b.renter_phone||b.renter_email||""}</small></td><td>${new Date(b.scheduled_for).toLocaleString()}</td><td><span class="status ${b.status}">${b.status}</span></td><td><code>${b.safety_code}</code></td></tr>`).join("")}</tbody></table></div>`:`<div class="adminEmpty"><b>No viewings yet</b><p>Viewing appointments will appear here.</p></div>`}
   </div>

   <div id="adminAttention" class="adminPanel" hidden>
     <div class="panelHead"><div><span class="kicker">Needs attention</span><h3>Availability expiring within 48 hours</h3></div></div>
     ${expiring.length?`<div class="adminCards">${expiring.map(adminListingCard).join("")}</div>`:`<div class="adminEmpty"><b>All good</b><p>No verified listing is about to lose freshness.</p></div>`}
   </div>

   <div class="adminRecent">
     <section><span class="kicker">Recent listings</span><h3>Latest property submissions</h3>${overview.recent_listings.length?overview.recent_listings.map(x=>`<div class="activityRow"><div><b>${x.title}</b><small>${x.area} • ${x.lister_name}</small></div><span class="status ${x.status}">${x.status}</span></div>`).join(""):"<p>No listings yet.</p>"}</section>
     <section><span class="kicker">Recent users</span><h3>Latest registrations</h3>${overview.recent_users.map(u=>`<div class="activityRow"><div><b>${u.name}</b><small>${u.email} • ${u.role}</small></div><span>${u.verified_identity?"ID ✓":"ID pending"}</span></div>`).join("")}</section>
   </div>`}
 else {const saved=await api("/api/saved"), bookings=await api("/api/bookings");html+=`<h3 style="margin-top:25px">Saved homes</h3><div class="dashList">${saved.map(x=>`<div class="dashItem"><h3>${x.title}</h3><p>${x.area} • ${money(x.rent)}</p></div>`).join("")||"<p>No saved homes yet.</p>"}</div><h3>Viewing appointments</h3><div class="dashList">${bookings.map(b=>`<div class="dashItem"><h3>${b.title}</h3><p>${new Date(b.scheduled_for).toLocaleString()} • ${b.status} • Safety code ${b.safety_code}</p></div>`).join("")||"<p>No viewing bookings yet.</p>"}</div>`}
 $("#dash").innerHTML=html;$("#logout").onclick=async()=>{await api("/api/auth/logout",{method:"POST"});me=null;$("#dashboardModal").classList.remove("open");await getMe()}
 const n=$("#newListing");if(n)n.onclick=showNewListing
 if(me.role==="admin"){
   const views={queue:"#adminQueue",listings:"#adminListings",users:"#adminUsers",bookings:"#adminBookings",attention:"#adminAttention"};
   $$(".adminTab").forEach(btn=>btn.onclick=()=>{
     $$(".adminTab").forEach(x=>x.classList.remove("active"));btn.classList.add("active");
     Object.values(views).forEach(sel=>{const el=$(sel);if(el)el.hidden=true});
     const target=$(views[btn.dataset.adminView]);if(target)target.hidden=false;
   });
   const search=$("#adminUserSearch");
   if(search)search.oninput=async()=>{
     const qs=new URLSearchParams();if(search.value.trim())qs.set("q",search.value.trim());
     const found=await api("/api/admin/users?"+qs);
     $("#adminUserList").innerHTML=found.map(adminUserCard).join("")||'<div class="adminEmpty"><b>No users found</b></div>';
   };
 }
}
function showNewListing(){
 $("#newBox").innerHTML=`<h3 style="margin-top:28px">Submit property</h3>
 <form id="newForm">
   <div class="listingModeBox">
     <label>Listing category
       <select name="listing_mode" id="listingMode">
         <option value="long_term">Long-term rental</option>
         <option value="short_stay">Airbnb / Short stay</option>
         <option value="furnished_monthly">Furnished monthly stay</option>
       </select>
     </label>
     <p id="modeHint">For tenants looking for a normal monthly rental.</p>
   </div>
   <div class="formGrid">
     <label>Title<input name="title" required placeholder="1 Bedroom • Ruiru"></label>
     <label>Area<input name="area" required></label>
     <label>County<input name="county" value="Nairobi"></label>
     <label>Type<select name="property_type"><option>Bedsitter</option><option>Studio</option><option>1 Bedroom</option><option>2 Bedroom</option><option>3 Bedroom</option><option>Maisonette</option><option>Holiday Home</option><option>Serviced Apartment</option></select></label>
     <label>Bedrooms<input name="bedrooms" type="number" value="1"></label>
     <label>Bathrooms<input name="bathrooms" type="number" value="1"></label>
     <label class="monthlyField">Monthly rent<input name="rent" type="number"></label>
     <label class="shortField" hidden>Nightly rate<input name="nightly_rate" type="number"></label>
     <label class="shortField" hidden>Weekly rate<input name="weekly_rate" type="number"></label>
     <label class="shortField" hidden>Monthly short-stay rate<input name="monthly_rate" type="number"></label>
     <label class="shortField" hidden>Cleaning fee<input name="cleaning_fee" type="number" value="0"></label>
     <label class="shortField" hidden>Security deposit<input name="security_deposit" type="number" value="0"></label>
     <label class="shortField" hidden>Minimum nights<input name="minimum_nights" type="number" value="1"></label>
     <label class="shortField" hidden>Maximum guests<input name="maximum_guests" type="number"></label>
     <label class="shortField" hidden>Check-in time<input name="check_in_time" type="time"></label>
     <label class="shortField" hidden>Check-out time<input name="check_out_time" type="time"></label>
     <label>Long-term deposit<input name="deposit" type="number"></label>
     <label>Service charge<input name="service_charge" type="number" value="0"></label>
     <label>Viewing fee<input name="viewing_fee" type="number" value="0"></label>
     <label>Available units<input name="units_available" type="number" value="1"></label>
     <label>Water<input name="water"></label>
     <label>Internet / Wi-Fi<input name="internet"></label>
     <label>Security<input name="security"></label>
     <label>Latitude<input name="latitude" type="number" step="any"></label>
     <label>Longitude<input name="longitude" type="number" step="any"></label>
   </div>
   <div class="amenityChecks">
     <label><input name="parking" type="checkbox"> Parking</label>
     <label><input name="furnished" type="checkbox"> Furnished</label>
     <label class="shortAmenity" hidden><input name="self_check_in" type="checkbox"> Self check-in</label>
     <label class="shortAmenity" hidden><input name="kitchen" type="checkbox"> Kitchen</label>
     <label class="shortAmenity" hidden><input name="workspace" type="checkbox"> Workspace</label>
     <label class="shortAmenity" hidden><input name="pool" type="checkbox"> Pool</label>
     <label class="shortAmenity" hidden><input name="gym" type="checkbox"> Gym</label>
   </div>
   <label>Description<textarea name="description" rows="4" placeholder="Current condition, access, rules, utilities and what makes the property suitable…"></textarea></label>
   <button class="primary">Submit for verification</button>
 </form>`;
 const form=$("#newForm"), mode=$("#listingMode"), hint=$("#modeHint");
 const syncMode=()=>{
   const short=mode.value==="short_stay", furnishedMonthly=mode.value==="furnished_monthly";
   $$(".shortField").forEach(x=>x.hidden=!short);
   $$(".shortAmenity").forEach(x=>x.hidden=!short);
   $$(".monthlyField").forEach(x=>x.hidden=short);
   hint.textContent=short
     ?"For Airbnb-style nightly or weekly stays. Add current rates, check-in details and guest amenities."
     : furnishedMonthly
       ?"For furnished homes rented mainly by the month."
       :"For tenants looking for a normal monthly rental.";
   if(furnishedMonthly) form.furnished.checked=true;
 };
 mode.onchange=syncMode;syncMode();
 form.onsubmit=async e=>{
   e.preventDefault();
   const f=Object.fromEntries(new FormData(e.target));
   ["parking","furnished","self_check_in","kitchen","workspace","pool","gym"].forEach(k=>f[k]=!!e.target[k]?.checked);
   try{
     await api("/api/listings",{method:"POST",body:JSON.stringify(f)});
     alert("Property submitted. Upload current photos/video from the dashboard, then it can be verified.");
     dashboard()
   }catch(x){alert(x.message)}
 };
}
window.uploadMedia=async(e,id)=>{const file=e.target.files[0];if(!file)return;const fd=new FormData();fd.append("file",file);try{const r=await fetch(`/api/listings/${id}/media`,{method:"POST",body:fd,credentials:"same-origin"});const d=await r.json();if(!r.ok)throw new Error(d.error);alert("Media uploaded and attached to the property.");dashboard()}catch(x){alert(x.message)}}
window.reconfirm=async(id,current)=>{const n=prompt("How many units are currently vacant?",current);if(n===null)return;try{await api(`/api/listings/${id}/reconfirm`,{method:"POST",body:JSON.stringify({units_available:Number(n)})});alert("Availability confirmed for 7 days.");dashboard()}catch(x){alert(x.message)}}

function adminListingCard(x){
  const expiry=x.availability_expires_at?new Date(x.availability_expires_at).toLocaleString():"Not confirmed";
  return `<article class="adminProperty">
    <div class="adminPropertyTop"><div><span class="status ${x.status}">${x.status}</span><h3>${x.title}</h3><p>${stayLabel(x)} • ${x.area} • ${stayPrice(x)}</p></div><div class="adminScore">${x.verification_score||"—"}<small>score</small></div></div>
    <div class="adminMeta">
      <span><b>${x.lister_name}</b><small>${x.lister_role}${x.lister_identity_verified?" • Identity ✓":" • Identity pending"}</small></span>
      <span><b>${x.units_available}</b><small>vacant units</small></span>
      <span><b>${x.media_count}</b><small>media files</small></span>
      <span><b>${expiry}</b><small>availability expiry</small></span>
    </div>
    <div class="actions">
      <button onclick="detail(${x.id})">View details</button>
      ${x.latitude&&x.longitude?`<button onclick="showMap(${x.latitude},${x.longitude},'${String(x.title).replaceAll("'","")}')">Map</button>`:""}
      ${!x.lister_identity_verified?`<button onclick="adminVerifyIdentity(${x.owner_id})">Verify lister ID</button>`:""}
      ${x.status==="pending"?`<button class="go" onclick="adminVerify(${x.id})">Approve listing</button><button onclick="adminReject(${x.id})">Reject</button>`:""}
      ${x.status==="verified"?`<button onclick="adminScore(${x.id},${x.verification_score||85})">Edit score</button><button onclick="adminPause(${x.id})">Pause</button>`:""}
    </div>
  </article>`;
}
function adminUserCard(u){
  return `<article class="adminUser">
    <div class="userAvatar">${u.name.split(" ").map(x=>x[0]).slice(0,2).join("").toUpperCase()}</div>
    <div class="userMain"><h3>${u.name}</h3><p>${u.email}${u.phone?` • ${u.phone}`:""}</p><div><span class="rolePill">${u.role}</span><span class="${u.verified_identity?"identityOk":"identityPending"}">${u.verified_identity?"Identity verified":"Identity not verified"}</span></div></div>
    <div class="actions">${u.role!=="admin"?(u.verified_identity?`<button onclick="adminUnverifyIdentity(${u.id})">Remove verification</button>`:`<button class="go" onclick="adminVerifyIdentity(${u.id})">Verify identity</button>`):""}</div>
  </article>`;
}
window.adminRefresh=()=>dashboard();
window.adminScore=async(id,current)=>{const s=prompt("Verification score (1–100):",current);if(!s)return;try{await api(`/api/admin/listings/${id}/score`,{method:"POST",body:JSON.stringify({score:Number(s)})});dashboard();load();stats()}catch(e){alert(e.message)}}
window.adminPause=async id=>{if(!confirm("Pause this listing? It will disappear from public search."))return;try{await api(`/api/admin/listings/${id}/pause`,{method:"POST",body:"{}"});dashboard();load();stats()}catch(e){alert(e.message)}}
window.adminVerifyIdentity=async id=>{if(!confirm("Mark this user's identity as verified?"))return;try{await api(`/api/admin/users/${id}/verify-identity`,{method:"POST",body:"{}"});dashboard()}catch(e){alert(e.message)}}
window.adminUnverifyIdentity=async id=>{if(!confirm("Remove this user's identity verification?"))return;try{await api(`/api/admin/users/${id}/unverify-identity`,{method:"POST",body:"{}"});dashboard()}catch(e){alert(e.message)}}

window.adminVerify=async id=>{const s=prompt("Verification score (1–100):","90");if(!s)return;try{await api(`/api/admin/listings/${id}/verify`,{method:"POST",body:JSON.stringify({score:Number(s)})});dashboard();load();stats()}catch(x){alert(x.message)}}
window.adminReject=async id=>{const reason=prompt("Reason for rejection:","Verification requirements not met");if(!reason)return;try{await api(`/api/admin/listings/${id}/reject`,{method:"POST",body:JSON.stringify({reason})});dashboard()}catch(x){alert(x.message)}}
await getMe();await stats();await load();