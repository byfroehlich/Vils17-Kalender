/* Reichweitenmessung vils17.at – ohne Cookies, speichert nichts auf dem Gerät. Details: /datenschutz/#reichweite */
(function(w,d,n){
var E="https://vils17-kalender.onrender.com/api/public/besuch";
if(n.doNotTrack=="1"||w.doNotTrack=="1"||n.globalPrivacyControl||!/(^|\.)vils17\.at$/.test(location.hostname))return;
var pid,t0,act,mx,seen,once;
function id(){var a=new Uint8Array(15);try{crypto.getRandomValues(a)}catch(e){for(var i=0;i<15;i++)a[i]=Math.random()*256}return Array.prototype.map.call(a,function(x){return("0"+x.toString(16)).slice(-2)}).join("")}
function send(o){o.pid=pid;var b=JSON.stringify(o);try{if(!(n.sendBeacon&&n.sendBeacon(E,b)))fetch(E,{method:"POST",body:b,keepalive:true,mode:"no-cors",credentials:"omit"})}catch(e){}}
function ev(name,v){var k=name+(v||"");if(name!="buchen_klick"&&name!="kontakt"){if(once[k])return;once[k]=1}send({t:"ev",n:name,v:v||void 0})}
function apt(u){var m=/apartmentId=(\d+)/.exec(u||"");return m?m[1]:""}
function vis(){return d.visibilityState=="visible"}
function scroll(){var h=d.documentElement,s=Math.min(100,Math.round((w.scrollY+w.innerHeight)/Math.max(h.scrollHeight,1)*100));if(s>mx)mx=s}
function eng(){if(t0){act+=Date.now()-t0;t0=vis()?Date.now():0}if(act>0)send({t:"eng",d:act,s:mx})}
function pv(){
pid=id();act=0;mx=0;once={};t0=vis()?Date.now():0;scroll();
var q=new URLSearchParams(location.search);
send({t:"pv",p:location.pathname,r:d.referrer||void 0,l:n.language,us:q.get("utm_source")||void 0,um:q.get("utm_medium")||void 0,uc:q.get("utm_campaign")||void 0});
}
pv();
w.addEventListener("scroll",scroll,{passive:true});
d.addEventListener("visibilitychange",function(){if(vis())t0=Date.now();else eng()});
w.addEventListener("pagehide",eng);
w.addEventListener("pageshow",function(e){if(e.persisted)pv()});
d.addEventListener("click",function(e){
var a=e.target&&e.target.closest&&e.target.closest("a[href]");if(!a)return;var h=a.href;
if(/booking\.smoobu\.com/.test(h))ev("buchen_klick",apt(h));
else if(/^tel:/.test(h))ev("kontakt","telefon");
else if(/^mailto:/.test(h))ev("kontakt","mail");
else if(/wa\.me|whatsapp/.test(h))ev("kontakt","whatsapp");
},true);
w.addEventListener("blur",function(){setTimeout(function(){var f=d.activeElement;if(f&&f.tagName=="IFRAME"&&/smoobu/.test(f.src))ev("buchungsmaske",apt(f.src))},0)});
if(w.IntersectionObserver){
seen=new IntersectionObserver(function(es){es.forEach(function(x){
if(x.isIntersecting){ev("abschnitt",x.target.getAttribute("data-m"));seen.unobserve(x.target)}
})},{rootMargin:"-45% 0px -45% 0px"});
d.querySelectorAll("[data-m]").forEach(function(s){seen.observe(s)});
}
w.v17m=ev;
})(window,document,navigator);
