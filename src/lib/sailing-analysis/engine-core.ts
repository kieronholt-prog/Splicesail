// @ts-nocheck
/* eslint-disable @typescript-eslint/no-explicit-any */
/* Auto-extracted from Sailstats index.html */
const DETECTION_DEFAULTS={
  tack:{minTurn:60,maxTurn:170,minSpeed:1.5,cooldownSec:4,beforePts:4,afterPts:5},
  gybe:{minTurn:45,maxTurn:230,minSpeed:1.8,cooldownSec:7,beforePts:6,afterPts:8},
};
const DEFAULT_SF_LINE_ENDS={
  endA:{lat:50.851722,lon:-1.309129},
  endB:{lat:50.851762,lon:-1.307463},
};
/** Per-leg track colours on map (`leg0`…`leg15`, then repeat). Must match `mapboxTrackLineColorByKindExpr`. */
const TRACK_LEG_SEGMENT_PALETTE=["#3b82f6","#f59e0b","#10b981","#a855f7","#ef4444","#06b6d4","#eab308","#f472b6","#94a3b8","#6366f1","#14b8a6","#ec4899","#84cc16","#f97316","#8b5cf6","#22c55e"];
const TRACK_LEG_SKIP_COLOR="#64748b";
const MAP_RND_BISECTOR_LINE="#a855f7";
const MAP_MANEUVER_COLORS={port:"#ff4a6a",stbd:"#4aff8a",tack:"#ff6b4a",gybe:"#4adfff",trkRound:"#ff9500"};

const RE=6371000,D=Math.PI/180;
function hav(a1,o1,a2,o2){const dl=(a2-a1)*D,do2=(o2-o1)*D;const a=Math.sin(dl/2)**2+Math.cos(a1*D)*Math.cos(a2*D)*Math.sin(do2/2)**2;return 2*RE*Math.asin(Math.sqrt(a))}
/** ENU (east,north) metres from a local origin (lat0,lon0) °, for small distances. */
function enuMeters(lat0,lon0,lat,lon){
  const c=Math.cos(lat0*D);
  return{x:(lon-lon0)*D*RE*c,y:(lat-lat0)*D*RE};
}
/** Local ENU offset (m) at lat0,lon0 → WGS84 (small distances, same as enu inverse). */
function enuMetersToLatLon(lat0,lon0,xM,yM){
  return{lat:lat0+yM/111320,lon:lon0+xM/(111320*Math.cos(lat0*D))};
}
/**
 * One **ray** from the mark (°T), length ≈`halfLenM` (m) forward and a short inset backward — used for map display
 * e.g. rounding bisector lines.
 */
function segmentOneRayBearingTwd(latM,lonM,rayBearingDeg,halfLenM=200){
  const f=Math.max(10,halfLenM);
  const o=Math.min(5,f*0.03);
  const θ=Number(rayBearingDeg)*D;
  const forw={x:Math.sin(θ)*f,y:Math.cos(θ)*f};
  const back={x:Math.sin(θ+Math.PI)*o,y:Math.cos(θ+Math.PI)*o};
  const ex=enuMetersToLatLon(latM,lonM,forw.x,forw.y);
  const in0=enuMetersToLatLon(latM,lonM,back.x,back.y);
  return[[in0.lon,in0.lat],[ex.lon,ex.lat]];
}
/**
 * When a mark has no `nextW` in the course sequence, chord-⊥ fallback: line through B (this mark) ⟂ prev→B.
 * Normal roundings use the outside-angle bisector (`computeRoundingOutsideBisectorBearingDeg`) + `segmentOneRayBearingTwd`.
 */
function segmentGateThroughBPerpChord(latA,lonA,latB,lonB,halfLenM=180){
  const b=enuMeters(latA,lonA,latB,lonB);
  const L0=Math.hypot(b.x,b.y);
  if(L0<0.1)return null;
  const ux=-(b.y/L0),uy=(b.x/L0);
  const p1=enuMetersToLatLon(latA,lonA,b.x+ux*halfLenM,b.y+uy*halfLenM);
  const p2=enuMetersToLatLon(latA,lonA,b.x-ux*halfLenM,b.y-uy*halfLenM);
  return[[p1.lon,p1.lat],[p2.lon,p2.lat]];
}
function segmentGateThroughAPerpChord(latA,lonA,latB,lonB,halfLenM=180){
  const b=enuMeters(latA,lonA,latB,lonB);
  const L0=Math.hypot(b.x,b.y);
  if(L0<0.1)return null;
  const ux=-(b.y/L0),uy=(b.x/L0);
  const p1=enuMetersToLatLon(latA,lonA,ux*halfLenM,uy*halfLenM);
  const p2=enuMetersToLatLon(latA,lonA,-ux*halfLenM,-uy*halfLenM);
  return[[p1.lon,p1.lat],[p2.lon,p2.lat]];
}
/**
 * Nudge gLbl ENU a few m so multiple gates at one mark don’t share one pixel.
 */
function nudgeGLabelM(lat,lon,idx){
  const g=Number(idx);
  if(!Number.isFinite(g))return{lat,lon};
  const oE=((g%6)-2.5)*1.0,oN=((Math.floor(g/6)%4)-1.5)*0.9;
  return enuMetersToLatLon(lat,lon,oE,oN);
}
/** Stable key for de-duplicating map LineString features (e.g. same chAlign line or repeated laps). */
function gateLineCoordsKey(seg){
  if(!seg||seg.length<2)return"";
  return seg.map(p=>`${Number(p[0]).toFixed(5)},${Number(p[1]).toFixed(5)}`).join(";");
}
function markGateLinesEqual(a,b){
  if(!a||!b||a.length!==b.length)return false;
  for(let i=0;i<a.length;i++){
    if(Math.abs(Number(a[i][0])-Number(b[i][0]))>1e-5||Math.abs(Number(a[i][1])-Number(b[i][1]))>1e-5)return false;
  }
  return true;
}
/** True when two **course** bearings °T (clockwise from N) are opposite (reciprocal track), within `tolDeg`. */
function bearingsNearlyReciprocalCourseDeg(brIn,brOut,tolDeg=6){
  if(!Number.isFinite(brIn)||!Number.isFinite(brOut))return false;
  let d=Math.abs(Number(brIn)-Number(brOut))%360;
  if(d>180)d=360-d;
  return Math.abs(d-180)<=tolDeg;
}
/**
 * One-sided gate line through a mark (vector-sum unit bisector, then +90°/ +270° for S/P). Sits alongside
 * `computeRoundingOutsideBisectorBearingDeg` + `orientRoundingRayForPortStarboard` — those use the **turn**
 * bisector (b−a in NE) and committee half-plane flip; this API uses **bearing-in / bearing-out** as **compass
 * directions of travel** and sums their (sin,cos) unit vectors. Do not replace leg detection with this.
 *
 * Port/starboard: raw S → (bisectorTwd+90)%360, P → (bisectorTwd+270)%360, then **`+180`** so the outward ray
 * lies on the rounding half-plane (raw rotation pointed the opposite way on the map vs track rounding).
 * This is not the same construction as `orientRoundingRayForPortStarboard` (committee / beam flip on the leg
 * bisector).
 *
 * @param {{lat:number, lon:number}} mark
 * @param {number|null} bearingInTwd  True **course** bearing (° clockwise from N), prev→this; null = start mark. Not wind.
 * @param {number|null} bearingOutTwd Same, this→next; null = finish mark.
 * @param {"P"|"S"} roundingTack
 * @param {number} [halfLenM=180]
 * @returns {{ start:{lat:number,lon:number}, end:{lat:number,lon:number}, gateBearingTwd:number } | null}
 *
 * **Reciprocal / hairpin** (in ≈ out+180°): vector-sum bisector is degenerate — gate ray uses **bearing in** °T as-is.
 */
function computeOneSidedGateLine(mark,bearingInTwd,bearingOutTwd,roundingTack,halfLenM=180){
  if(!mark||!Number.isFinite(mark.lat)||!Number.isFinite(mark.lon))return null;
  if(roundingTack!=="P"&&roundingTack!=="S")return null;
  const hasIn=bearingInTwd!=null&&Number.isFinite(Number(bearingInTwd));
  const hasOut=bearingOutTwd!=null&&Number.isFinite(Number(bearingOutTwd));
  if(!hasIn&&!hasOut)return null;
  if(hasIn&&hasOut&&bearingsNearlyReciprocalCourseDeg(Number(bearingInTwd),Number(bearingOutTwd))){
    const gateBearingTwd=((Number(bearingInTwd)%360)+360)%360;
    const arm=Math.max(1,Number.isFinite(Number(halfLenM))?Number(halfLenM):180);
    const end=destinationPoint(mark.lat,mark.lon,gateBearingTwd,arm);
    return{start:{lat:mark.lat,lon:mark.lon},end,gateBearingTwd};
  }
  const vIn=hasIn?{x:Math.sin(Number(bearingInTwd)*D),y:Math.cos(Number(bearingInTwd)*D)}:null;
  const vOut=hasOut?{x:Math.sin(Number(bearingOutTwd)*D),y:Math.cos(Number(bearingOutTwd)*D)}:null;
  let vBisector;
  if(vIn&&vOut){
    const sx=vIn.x+vOut.x,sy=vIn.y+vOut.y;
    const len=Math.hypot(sx,sy);
    if(len<1e-6)vBisector=vIn;
    else vBisector={x:sx/len,y:sy/len};
  }else if(vIn)vBisector=vIn;
  else vBisector=vOut;
  const bisectorTwd=(Math.atan2(vBisector.x,vBisector.y)/D+360)%360;
  const rawGate=roundingTack==="S"?(bisectorTwd+90)%360:(bisectorTwd+270)%360;
  const gateBearingTwd=(rawGate+180)%360;
  const arm=Math.max(1,Number.isFinite(Number(halfLenM))?Number(halfLenM):180);
  const end=destinationPoint(mark.lat,mark.lon,gateBearingTwd,arm);
  return{start:{lat:mark.lat,lon:mark.lon},end,gateBearingTwd};
}
/**
 * GeoJSON FeatureCollection: one-sided gate LineStrings (+ gLbl points), [lon, lat].
 * @param {Array<{name:string,lat:number,lon:number,tack?:string,lap?:number}>} orderedMarks  e.g. `expandCourseMarks` output
 * @param {number} [halfLenM=180]
 * @param {null|{endA:{lat:number,lon:number},endB:{lat:number,lon:number}}} [sfEnds]  S/F line — midpoint anchors virtual prev/next for course ends (same pattern as prior `buildMarkGateDebugFC`).
 */
function buildOneSidedGateFC(orderedMarks,halfLenM=180,sfEnds=null){
  if(!orderedMarks?.length)return{type:"FeatureCollection",features:[]};
  const sfMid=sfEnds?.endA&&sfEnds?.endB?{
    lat:(sfEnds.endA.lat+sfEnds.endB.lat)/2,
    lon:(sfEnds.endA.lon+sfEnds.endB.lon)/2
  }:null;
  const wpFromRow=row=>(row&&row.lat!=null&&row.lon!=null&&Number.isFinite(row.lat)&&Number.isFinite(row.lon)
    ?{lat:row.lat,lon:row.lon}:null);
  const shortN=n=>n&&String(n).length>10?String(n).slice(0,9)+"\u2006\u2026":String(n);
  const markBrief=(row,isSforF)=>{
    if(isSforF)return"S/F";
    if(!row)return"—";
    const nm=String(row.name||"?");
    const base=shortN(nm);
    const lp=row.lap!=null&&Number(row.lap)>0?`\u00b7L${Number(row.lap)|0}`:"";
    return`${base}${lp}`;
  };
  const feats=[],seen=new Set();
  let gNum=0;
  const arm=Math.max(1,Number.isFinite(Number(halfLenM))?Number(halfLenM):180);
  for(let mi=0;mi<orderedMarks.length;mi++){
    const m=orderedMarks[mi];
    const tack=m.tack;
    if(tack!=="P"&&tack!=="S")continue;
    const curr=wpFromRow(m);
    if(!curr)continue;
    let prevWp=null;
    if(mi>0){
      const pr=orderedMarks[mi-1];
      prevWp=wpFromRow(pr)??(String(pr.name)==="START"&&sfMid?sfMid:null);
    }else if(sfMid)prevWp=sfMid;
    let nextWp=null;
    if(mi+1<orderedMarks.length){
      const nx=orderedMarks[mi+1];
      nextWp=wpFromRow(nx)??(String(nx.name)==="FINISH"&&sfMid?sfMid:null);
    }else if(sfMid)nextWp=sfMid;
    const bearingIn=prevWp?bear(prevWp.lat,prevWp.lon,curr.lat,curr.lon):null;
    const bearingOut=nextWp?bear(curr.lat,curr.lon,nextWp.lat,nextWp.lon):null;
    const res=computeOneSidedGateLine(curr,bearingIn,bearingOut,tack,arm);
    if(!res||!Number.isFinite(res.gateBearingTwd))continue;
    const seg=[[res.start.lon,res.start.lat],[res.end.lon,res.end.lat]];
    const key=gateLineCoordsKey(seg);
    if(seen.has(key))continue;
    seen.add(key);
    const gi=++gNum;
    const name=String(m.name||"?");
    let fromLab=null,toLab=null;
    if(mi>0){
      const pr=orderedMarks[mi-1];
      const pn=String(pr.name||"");
      fromLab=pn==="START"?markBrief(null,true):markBrief(pr,false);
    }else if(sfMid)fromLab=markBrief(null,true);
    if(mi+1<orderedMarks.length){
      const nx=orderedMarks[mi+1];
      const nn=String(nx.name||"");
      toLab=nn==="FINISH"?markBrief(null,true):markBrief(nx,false);
    }else if(sfMid)toLab=markBrief(null,true);
    const sideLab=tack==="P"?"Port":"Stbd";
    const tag=fromLab&&toLab?`${fromLab} → ${toLab} · ${sideLab}`:`${shortN(name)} · ${sideLab}`;
    feats.push({type:"Feature",properties:{kind:"oneSided",g:gi,name,mark:name,lap:Number(m.lap)||0,gateDeg:res.gateBearingTwd,tack,tag},geometry:{type:"LineString",coordinates:seg}});
    const midLon=(seg[0][0]+seg[1][0])/2,midLa=(seg[0][1]+seg[1][1])/2;
    {const p=nudgeGLabelM(midLa,midLon,gi);feats.push({type:"Feature",properties:{kind:"gLbl",g:gi,tag,sub:"gate"},geometry:{type:"Point",coordinates:[p.lon,p.lat]}});}
  }
  return{type:"FeatureCollection",features:feats};
}
/** Dev-only: call `__gateLineSelfTest()` from the console; not attached on production hosts. */
function __gateLineSelfTest(){
  const rows=[];
  const add=(label,bIn,bOut,tack,note)=>{
    const r=computeOneSidedGateLine({lat:0,lon:0},bIn,bOut,tack,180);
    const g=r&&Number.isFinite(r.gateBearingTwd)?Math.round(r.gateBearingTwd*100)/100:NaN;
    rows.push({label,bearingIn:bIn,bearingOut:bOut,tack,gateBearingTwd:g,note});
  };
  add("Windward port (180/270 P)",180,270,"P","~315°T after +180 correction");
  add("Wraparound 355/10 S",355,10,"S","~272.5°, no NaN");
  add("Passing 90/95 P",90,95,"P","~182.5°T");
  add("Hairpin 0/180 S",0,180,"S","reciprocal: gate = bearing in (0°)");
  add("Start null/0 S",null,0,"S","~270°T");
  add("Finish 270/P",270,null,"P","~0°T (north)");
  console.table(rows);
  return rows;
}
try{
  const h=typeof location!=="undefined"&&location.hostname;
  const proto=typeof location!=="undefined"&&location.protocol;
  const allowDev=!h||h==="localhost"||h==="127.0.0.1"||proto==="file:";
  if(typeof window!=="undefined"&&allowDev)window.__gateLineSelfTest=__gateLineSelfTest;
}catch(_){}
/** Lateral distance (m) in local ENU from P to the infinite line through C along bearing `lineBearingTwd` (°T). */
function lateralDistMToLineAtCFromP(latC,lonC,latP,lonP,lineBearingTwd){
  if(!Number.isFinite(lineBearingTwd))return NaN;
  const v=enuMeters(latC,lonC,latP,lonP);
  const θ=Number(lineBearingTwd)*D;
  const tx=Math.sin(θ),ty=Math.cos(θ);
  return Math.abs(v.x*ty-v.y*tx);
}
/** Signed lateral (m) to infinite line through M along `lineBearingTwd` (°T). Same line as `lateralDistMToLineAtCFromP` (unsigned). */
function signedLateralMetersToLineFromMAlongBearingTwd(latM,lonM,latP,lonP,lineBearingTwd){
  if(!Number.isFinite(lineBearingTwd))return NaN;
  const v=enuMeters(latM,lonM,latP,lonP);
  const θ=Number(lineBearingTwd)*D;
  const tx=Math.sin(θ),ty=Math.cos(θ);
  return v.x*ty-v.y*tx;
}
function normNEDouble(ne){const h=Math.hypot(ne.n,ne.e);return h<1e-12?{n:1,e:0}:{n:ne.n/h,e:ne.e/h};}
/** North/east components for bearing °T clockwise from north. */
function vecFromBearTwd(deg){
  const θ=(Number(deg)%360)*D;return{n:Math.cos(θ),e:Math.sin(θ)};
}
function bearTwdFromNE(n,e){return((Math.atan2(e,n)/D)+360)%360;}
/**
 * One rounding line through the mark (°T): ray on the angular bisector of the **navigation turn**—the interior
 * angle at the mark between **inbound** (prev→curr) and **outbound** (curr→next). Uses unit(prev→curr) and
 * unit(curr→next): bisector direction ∝ **b − a** (`a`=inbound bearing vector, `b`=outbound). Fallback when
 * `a ‖ −b`: line ⟂ course (straight-line or reversal). (Using **curr→prev − curr→next** equiv. `−b−a` was wrong—perpendicular.)
 * @param tack `P`|`S`|null — orients the **ray** °T so gate half-planes match leave-to-port / leave-to-starboard (`orientRoundingRayForPortStarboard`).
 */
function computeRoundingOutsideBisectorBearingDeg(prev,curr,next,tack=null){
  if(!prev||!curr||!next)return null;
  const a=vecFromBearTwd(bear(prev.lat,prev.lon,curr.lat,curr.lon)); // inbound
  const b=vecFromBearTwd(bear(curr.lat,curr.lon,next.lat,next.lon)); // outbound
  const sn=b.n-a.n,se=b.e-a.e; // −a+b = bisector toward rounding side vs acute supplement
  let brRaw;
  if(Math.hypot(sn,se)<1e-9){
    const pn=-a.e,pe=a.n;
    const ne=normNEDouble({n:pn,e:pe});
    brRaw=bearTwdFromNE(ne.n,ne.e);
  }else{
    const ne=normNEDouble({n:sn,e:se});
    brRaw=bearTwdFromNE(ne.n,ne.e);
  }
  return orientRoundingRayForPortStarboard(brRaw,curr.lat,curr.lon,next.lat,next.lon,tack);
}
/**
 * Map overlay: one-sided gate line per rounded mark (`buildOneSidedGateFC`); legacy name kept for callers.
 * @param {number} [halfLenM] metres — use a **short** value for drawing (see `MARK_GATE_MAP_DRAW_ARM_M`); keep `MARK_GATE_LINE_ARM_M` for geometric distance code only.
 */
function buildMarkGateDebugFC(preamble,lapMarks,laps,sfEnds,halfLenM=180){
  const markPositions=lapMarks||[];
  if(!markPositions.length)return{type:"FeatureCollection",features:[]};
  const fullSeq=expandCourseMarks(preamble,markPositions,Math.max(1,Number(laps)||1));
  if(fullSeq.length<1)return{type:"FeatureCollection",features:[]};
  return buildOneSidedGateFC(fullSeq,halfLenM,sfEnds);
}

/**
 * Gate line through A, perpendicular to chord A→B (centre A to centre B in metres, local ENU at A).
 * Zero when (P−A)·(B−A)=0 — the line through A perpendicular to the mark-to-mark chord (not the chord line).
 * Cross product was the wrong test (that is zero on the chord, not the beam through A).
 */
function sideOfPerpAtA(latA,lonA,latB,lonB,latP,lonP){
  const b=enuMeters(latA,lonA,latB,lonB);
  const p=enuMeters(latA,lonA,latP,lonP);
  if(Math.hypot(b.x,b.y)<0.1)return 0;
  return p.x*b.x+p.y*b.y;
}
/**
 * Gate through B, ⊥ to chord A→B: (P−B)·(B−A)=0. Uses same chord vector b=(B−A) in A’s frame, (P−A) as p.
 */
function sideOfPerpAtB(latA,lonA,latB,lonB,latP,lonP){
  const b=enuMeters(latA,lonA,latB,lonB);
  const p=enuMeters(latA,lonA,latP,lonP);
  if(Math.hypot(b.x,b.y)<0.1)return 0;
  return (p.x-b.x)*b.x+(p.y-b.y)*b.y;
}
/** Same upwind test as classifyLegs: rel=(legBearing−wd+360)%360, upwind if rel<60 or rel>300. */
function isUpwindLegBearingVsWindDeg(legBearing,wdFrom){
  if(!Number.isFinite(legBearing)||!Number.isFinite(wdFrom))return false;
  const rel=((legBearing-wdFrom+360)%360);
  return rel<60||rel>300;
}
const NEAR_UPWIND_DEG=15;
/** `windFrom` meteorological: direction **to** the wind = `(windFrom+180)%360`. */
function upwindBearingTwdFromWindFromDeg(wdF){
  return((Number(wdF)+180)%360);
}
/**
 * `legBearing` along approach (e.g. last→this mark) within ±NEAR_UPWIND_DEG of the **upwind** bearing
 * `(windFrom+180)%360` (into wind) — one trigger for the **U±135** leg entry gate. Also see `useUpwindEntryGateBearing` + named windward mark.
 */
function isNearUpwindApproach15Deg(legBearing,windFromDeg){
  if(!Number.isFinite(legBearing)||!Number.isFinite(windFromDeg))return false;
  const u=upwindBearingTwdFromWindFromDeg(windFromDeg);
  return Math.abs(adiff(legBearing,u))<=NEAR_UPWIND_DEG;
}
/**
 * “Leg entry” / upwind in-gate **along-approach** direction (°T, clockwise from N). Let
 * `U = (windFrom+180)%360` (into wind). Stbd: `U−135`; Port: `U+135`.
 */
function upwindEntryGateBearingTwd(tack,windFromDeg){
  if(!Number.isFinite(windFromDeg))return null;
  const U=upwindBearingTwdFromWindFromDeg(windFromDeg);
  if(tack==="P")return(U+135)%360;
  if(tack==="S"||tack==null||tack==="")return(U-135+360)%360;
  return(U+135)%360;
}
function isWindwardMarkNameMatch(currentMarkName,windwardMarkName){
  if(!currentMarkName||!windwardMarkName)return false;
  return String(currentMarkName).trim()===String(windwardMarkName).trim();
}
/** Bespoke course: mark name is literally "Windward" (case-insensitive). */
function isNamedWindwardMark(markName){
  return String(markName||"").trim().toLowerCase()==="windward";
}
/**
 * For **map** gate rules: mark is "windward" if name matches user field, or name is `Windward`, or
 * `legTowardMarkDeg` (track toward this or toward next) is in the upwind sector vs met wind FROM
 * (same as `isUpwindLegBearingVsWindDeg` — 60° cone around upwind in sailing coords).
 */
function isWindwardMarkForMapGates(markName,windwardFieldName,legTowardMarkDeg,windFromDeg){
  if(isNamedWindwardMark(markName))return true;
  if(windwardFieldName&&String(windwardFieldName).trim()&&isWindwardMarkNameMatch(markName,windwardFieldName))return true;
  if(Number.isFinite(legTowardMarkDeg)&&Number.isFinite(windFromDeg)&&isUpwindLegBearingVsWindDeg(legTowardMarkDeg,windFromDeg))return true;
  return false;
}
/**
 * Upwind / windward in-gate: use 135°-from-upwind when tack+wind and (|approach−upwind|≤15° or mark is the named windward mark).
 */
function useUpwindEntryGateBearing(legBearing,windFromDeg,markName,windwardMarkName){
  if(!Number.isFinite(windFromDeg)||!Number.isFinite(legBearing))return false;
  if(isNearUpwindApproach15Deg(legBearing,windFromDeg))return true;
  if(windwardMarkName&&isWindwardMarkNameMatch(markName,windwardMarkName))return true;
  return false;
}
function tackSignGates(tack){
  if(tack==="P")return-1;
  return 1;
}
/**
 * ENU (E,N) offset in m: `sin(θ), cos(θ)` for bearing **θ** °T. Length `scaleM` (m) in that direction.
 */
function enuVecFromBearingMetersTwd(bearingDeg,scaleM){
  const θ=Number(bearingDeg)*D;
  const f=Number(scaleM);
  if(!Number.isFinite(f)||f<0.1)return{x:0,y:0};
  return{x:Math.sin(θ)*f,y:Math.cos(θ)*f};
}
/**
 * `sideOfPerpAtA`: line through A, ⟂ to chord along `b` in A’s ENU. Here `b` = normal (A→B) in m at A.
 */
function sideValuePerpAtAChordEnuA(latA,lonA,latP,lonP,bEnuX,bEnuY){
  const p=enuMeters(latA,lonA,latP,lonP);
  const L=Math.hypot(bEnuX,bEnuY);
  if(L<0.1)return 0;
  return(p.x*bEnuX+p.y*bEnuY)/L;
}
/**
 * Line through B, ⟂ to chord, normal in A’s ENU = bNorm (same as sideOfPerpAtB for real chord).
 * `bB` = (B−A) in A’s; `bNorm` = gate normal in A (any length, non-zero).
 */
function sideValuePerpAtBChordEnuA(latA,lonA,latB,lonB,latP,lonP,bBEnuX,bBEnuY,bNormX,bNormY){
  const p=enuMeters(latA,lonA,latP,lonP);
  const L=Math.hypot(bNormX,bNormY);
  if(L<0.1)return 0;
  return((p.x-bBEnuX)*bNormX+(p.y-bBEnuY)*bNormY)/L;
}
const LEG_CHORD_MIN_M=3;
/** Min GNSS samples in a leg / perp window (1 Hz, fast legs, or exit→entry clip can be only a few points). */
const LEG_MIN_TRACK_POINTS=2;
function segmentSignCrosses(s0,s1){
  if(!Number.isFinite(s0)||!Number.isFinite(s1))return false;
  return s0*s1<0;
}
/** Sum consecutive haversines along `pts[i0]…pts[i1]` (never `p.dist`): on densified tracks, `dist` still
 * refers to the **pre-densify** neighbour, so using it after inserted points double-counts sparse segments. */
function sumPathDist(pts,i0,i1){
  if(i1<=i0||!pts?.length)return 0;
  let s=0;
  for(let k=i0+1;k<=i1;k++){
    const a=pts[k-1],b=pts[k];
    if(!a||!b)continue;
    s+=hav(a.lat,a.lon,b.lat,b.lon);
  }
  return s;
}
function firstPerpCrossing(pts, iStart, jEnd, sideAt){
  const sF=Math.max(0,Math.floor(iStart|0));
  const e=Math.min(jEnd,pts.length-1);
  for(let j=Math.max(1,sF+1);j<=e;j++){
    const a=pts[j-1],b=pts[j];
    const s0=sideAt(a),s1=sideAt(b);
    if(segmentSignCrosses(s0,s1))return j;
  }
  return-1;
}
function allPerpCrossingEnds(pts, jMin, jEnd, sideAt){
  const o=[];
  for(let j=Math.max(1,jMin);j<=jEnd&&j<pts.length;j++){
    const a=pts[j-1],b=pts[j];
    if(segmentSignCrosses(sideAt(a),sideAt(b)))o.push(j);
  }
  return o;
}
/** Lateral (m) of mark from bow: + = mark to starboard (right), − = to port, using COG at boat (° T). */
function markLateralFromBowM(bLat,bLon,mLat,mLon,cogDeg){
  if(cogDeg==null||!Number.isFinite(cogDeg))return null;
  const θ=cogDeg*D;
  const c=Math.cos(bLat*D);
  const dE=(mLon-bLon)*D*RE*c,dN=(mLat-bLat)*D*RE;
  const rE=Math.cos(θ),rN=-Math.sin(θ);
  return dE*rE+dN*rN;
}
function segmentHeadingForCrossing(pts,j){
  if(j==null||j<0||!pts?.[j])return null;
  const b=pts[j],a=pts[Math.max(0,j-1)];
  if(Number.isFinite(b.cog))return b.cog;
  if(Number.isFinite(a?.cog))return a.cog;
  if(a&&b)return bear(a.lat,a.lon,b.lat,b.lon);
  return null;
}
/** P/S: mark to port (P) or starboard (S) of bow at crossing. tack null/unknown → any crossing. */
function perpCrossingSatisfiesMarkTack(pts,j,tack,mLat,mLon){
  if(tack!=="P"&&tack!=="S")return true;
  const c=segmentHeadingForCrossing(pts,j);
  if(c==null)return true;
  const b=pts[j],lat=b.lat,lon=b.lon;
  const L=markLateralFromBowM(lat,lon,mLat,mLon,c);
  if(L==null||!Number.isFinite(L))return true;
  const lim=1.5;
  if(tack==="S")return L>-lim;
  if(tack==="P")return L<lim;
  return true;
}
/**
 * Mark rounding: outside-angle bisector crossing (see `computeRoundingOutsideBisectorBearingDeg`).
 */
function detectMarkInboundOutboundGates(pts,prev,curr,next,searchFrom,tack,_wf,_cn,_wm,_nn){
  const c1=hav(prev.lat,prev.lon,curr.lat,curr.lon);
  const c2=hav(curr.lat,curr.lon,next.lat,next.lon);
  if(c1<LEG_CHORD_MIN_M||c2<LEG_CHORD_MIN_M||!Number.isFinite(c1)||!Number.isFinite(c2))
    return{ok:false,gateDetDebug:{mode:"chord",fail:"chord_too_short",c1M:c1,c2M:c2,minM:LEG_CHORD_MIN_M,trackRef:"gps_latlon"}};
  const bis=computeRoundingOutsideBisectorBearingDeg(prev,curr,next,tack);
  if(bis==null||!Number.isFinite(bis))return{ok:false,gateDetDebug:{mode:"bisector",fail:"no_bearing"}};
  const sF=Math.max(0,searchFrom|0);
  const jEnd=pts.length-1;
  const sideFn=roundingBisectorSideFn(prev,curr,next,tack);
  let straddleLax=0;
  for(let j=Math.max(1,sF+1);j<=jEnd;j++){
    const a=pts[j-1],b=pts[j];
    if(segmentSignCrosses(sideFn(a),sideFn(b)))straddleLax++;
  }
  for(let j=Math.max(1,sF+1);j<=jEnd;j++){
    const a=pts[j-1],b=pts[j];
    if(!segmentSignCrosses(sideFn(a),sideFn(b)))continue;
    if(tack&&(tack==="P"||tack==="S")&&!perpCrossingSatisfiesMarkTack(pts,j,tack,curr.lat,curr.lon))continue;
    return{ok:true,entryIdx:j,exitIdx:j,trackM:1,straightM:1,gateDetDebug:{mode:"bisector",bisDeg:bis,straddleLax}};
  }
  return{ok:false,gateDetDebug:{mode:"bisector",fail:"no_crossing",bisDeg:bis,straddleLax}};
}
/** @returns {idx:number, neg:boolean} */
function firstPerpCrossingWithNeg(pts,sF,jEnd,sideAt){
  let c=firstPerpCrossing(pts,sF,jEnd,sideAt);
  if(c>=0)return{idx:c,neg:false};
  c=firstPerpCrossing(pts,sF,jEnd,p=>-sideAt(p));
  return c>=0?{idx:c,neg:true}:{idx:-1,neg:false};
}
/**
 * Per-leg windows aligned with map marks: **committee line** (START) and **rounding bisector** crossings at A and B
 * (`signedMetersToRoundingBisectorAtMark` + `firstPerpCrossingWithNeg`), same geometry as `detectMarkInboundOutboundGates`.
 * Falls back in caller to chord-⊥ when null.
 */
function tryMapAlignedLegPerpCrossings(pts,latA,lonA,latB,lonB,searchFrom,fromMark,toMarkName,tackFrom,tackTo,_wdF,_wwm,legMapCtx,e0,e1,hasSf){
  const base={wPrev:legMapCtx?.wPrev??null,wAfter:legMapCtx?.wAfter??null,nameAfter:legMapCtx?.nameAfter??null};
  const legCtx=enrichLegMapCtxForGates(base,latA,lonA,latB,lonB,fromMark,toMarkName);
  if(!legCtx)return null;
  const sF=Math.max(0,searchFrom|0);
  const jEnd=pts.length-1;
  const fromM=String(fromMark||"");
  const toM=String(toMarkName||"");
  const{wPrev,wAfter}=legCtx;
  let cA=-1,cB=-1,gOut=null,gIn=null,cAmap=false,cBmap=false;
  const WA={lat:latA,lon:lonA};
  const WB={lat:latB,lon:lonB};
  if(fromM==="START"&&hasSf&&e0&&e1){
    cA=firstCommitteeLineSegmentCrossing(pts,sF,jEnd,e0,e1);
    cAmap=true;
    if(cA<0)return null;
    if(!wAfter||!Number.isFinite(wAfter.lat)||!Number.isFinite(wAfter.lon))return null;
    const brTo=computeRoundingOutsideBisectorBearingDeg(WA,WB,wAfter,tackTo??null);
    if(brTo==null||!Number.isFinite(brTo))return null;
    gIn={bisDeg:brTo};
    const sideB=p=>signedMetersToRoundingBisectorAtMark(p.lat,p.lon,latB,lonB,brTo);
    const cBr=firstPerpCrossingWithNeg(pts,cA,jEnd,sideB);
    cB=cBr.idx;
    cBmap=true;
  }else if(toM==="FINISH"&&hasSf&&e0&&e1&&wPrev&&fromM!=="START"){
    const brFrom=computeRoundingOutsideBisectorBearingDeg(wPrev,WA,WB,tackFrom??null);
    if(brFrom==null||!Number.isFinite(brFrom))return null;
    gOut={bisDeg:brFrom};
    const sideA=p=>signedMetersToRoundingBisectorAtMark(p.lat,p.lon,latA,lonA,brFrom);
    const cAr=firstPerpCrossingWithNeg(pts,sF,jEnd,sideA);
    cA=cAr.idx;
    cAmap=true;
    if(cA<0)return null;
    cB=firstCommitteeLineSegmentCrossing(pts,Math.max(cA|0,sF),jEnd,e0,e1);
    cBmap=true;
  }else if(wPrev&&wAfter&&fromM!=="START"&&toM!=="FINISH"){
    const brFrom=computeRoundingOutsideBisectorBearingDeg(wPrev,WA,WB,tackFrom??null);
    const brTo=computeRoundingOutsideBisectorBearingDeg(WA,WB,wAfter,tackTo??null);
    if(brFrom==null||brTo==null||!Number.isFinite(brFrom)||!Number.isFinite(brTo))return null;
    gOut={bisDeg:brFrom};
    gIn={bisDeg:brTo};
    const sideA=p=>signedMetersToRoundingBisectorAtMark(p.lat,p.lon,latA,lonA,brFrom);
    const sideB=p=>signedMetersToRoundingBisectorAtMark(p.lat,p.lon,latB,lonB,brTo);
    const cAr=firstPerpCrossingWithNeg(pts,sF,jEnd,sideA);
    cA=cAr.idx;
    cAmap=true;
    if(cA<0)return null;
    const cBr=firstPerpCrossingWithNeg(pts,cA,jEnd,sideB);
    cB=cBr.idx;
    cBmap=true;
  }else
    return null;
  if(cB<0||cB<=cA)return null;
  if(cB-cA+1<LEG_MIN_TRACK_POINTS)return null;
  return{cA,cB,cAmap,cBmap,gOut,gIn};
}

/**
 * Leg = map-aligned **bisector** crossings when possible (+ committee line for START/FINISH); virtual 500m prev/next like `detectMark`.
 * If that fails, chord-⊥ fallback with **5nm** + `signedMetersToABLineLikeCommittee`.
 * **START** → first mark: A = committee line. **Mark↔mark**: A = bisector at A, B = bisector at B (same as map overlay).
 */
function findMapLegGates(pts,latA,lonA,latB,lonB,searchFrom,fbStart,fbEnd,fromMark,startFinishLine,gpsToBowM,windFromDeg=null,tackFrom=null,tackTo=null,toMarkName=null,windwardMarkName=null,legMapCtx=null){
  const c=hav(latA,lonA,latB,lonB);
  if(c<LEG_CHORD_MIN_M||!Number.isFinite(c))return{startIdx:fbStart,endIdx:fbEnd,roundingM:0,startLineDistanceSignedM:null,legPathDef:"closest",roundingKind:null,gateDebug:{fail:"chord_too_short",chordM:c}};
  const s0=Math.max(0,searchFrom|0),idxEnd=fbEnd|0;
  const wdF=Number(windFromDeg);
  const wwm=String(windwardMarkName||"").trim();
  const e0=startFinishLine?.endA, e1=startFinishLine?.endB;
  const hasSf=e0&&e1&&Number.isFinite(e0.lat)&&Number.isFinite(e0.lon)&&Number.isFinite(e1.lat)&&Number.isFinite(e1.lon);
  const chLeg=bear(latA,lonA,latB,lonB);
  const mapTry=tryMapAlignedLegPerpCrossings(pts,latA,lonA,latB,lonB,searchFrom,fromMark,toMarkName,tackFrom,tackTo,wdF,wwm,legMapCtx,e0,e1,hasSf);
  let cA, cB, useU135, sideA, sideB, bChord, tsA, tsB, bNormAx, bNormAy, bNormBx, bNormBy, mapLegOk=false, gateGOut=null, gateGIn=null, finishFallbackOk=false;
  const jEnd=pts.length-1;
  const sF=Math.max(0,searchFrom|0);
  if(mapTry){
    cA=mapTry.cA;cB=mapTry.cB;mapLegOk=true;gateGOut=mapTry.gOut;gateGIn=mapTry.gIn;
  }else{
    const fromM0=String(fromMark||"");
    const toM0=String(toMarkName||"");
    const finishTried=toM0==="FINISH"&&hasSf&&e0&&e1&&fromM0!=="START";
    if(finishTried&&legMapCtx){
      const lctx=enrichLegMapCtxForGates(
        {wPrev:legMapCtx.wPrev??null,wAfter:legMapCtx.wAfter??null,nameAfter:legMapCtx.nameAfter??null},
        latA,lonA,latB,lonB,fromMark,toMarkName
      );
      const wPr=lctx&&lctx.wPrev;
      if(wPr&&Number.isFinite(wPr.lat)&&Number.isFinite(wPr.lon)){
        const brFinish=computeRoundingOutsideBisectorBearingDeg(wPr,{lat:latA,lon:lonA},{lat:latB,lon:lonB},tackFrom??null);
        const gO=brFinish!=null&&Number.isFinite(brFinish)?{bisDeg:brFinish}:null;
        if(gO){
          const sFinA=p=>signedMetersToRoundingBisectorAtMark(p.lat,p.lon,latA,lonA,gO.bisDeg);
          const cAr=firstPerpCrossingWithNeg(pts,sF,jEnd,sFinA);
          const cAt=cAr.idx;
          if(cAt>=0){
            const cBt=firstCommitteeLineSegmentCrossing(pts,Math.max(cAt|0,sF),jEnd,e0,e1);
            if(cBt>=0&&cBt>cAt&&cBt-cAt+1>=LEG_MIN_TRACK_POINTS){
              cA=cAt;
              cB=cBt;
              gateGOut=gO;
              gateGIn=null;
              useU135=false;
              sideA=sFinA;
              finishFallbackOk=true;
            }
          }
        }
      }
    }
    if(finishTried&&!finishFallbackOk){
      return{
        startIdx:fbStart,endIdx:fbEnd,roundingM:0,startLineDistanceSignedM:null,legPathDef:"closest",roundingKind:null,
        gateDebug:{fail:"finish_leg_gates",reason:"map_try_failed_out_or_committee",cAIdx:Number.isFinite(cA)?cA:null,cBIdx:Number.isFinite(cB)?cB:null,searchFrom:sF,legFallback:"finish_map_out_plus_committee"},
      };
    }
    if(!finishFallbackOk){
    useU135=!!tackFrom&&!!tackTo&&Number.isFinite(wdF)&&(isWindwardMarkForMapGates(String(toMarkName||""),String(windwardMarkName||""),chLeg,wdF)||useUpwindEntryGateBearing(chLeg,wdF,toMarkName,windwardMarkName));
    bChord=enuMeters(latA,lonA,latB,lonB);
    tsA=tackSignGates(tackFrom);
    tsB=tackSignGates(tackTo);
    bNormAx=bNormAy=bNormBx=bNormBy=0;
    if(useU135){
      const apA=upwindEntryGateBearingTwd(tackFrom,wdF),apB=upwindEntryGateBearingTwd(tackTo,wdF);
      if(apA!=null&&apB!=null){
        const sA=enuVecFromBearingMetersTwd(apA,Math.max(c,1));
        const sB=enuVecFromBearingMetersTwd(apB,Math.max(c,1));
        bNormAx=sA.x;bNormAy=sA.y;
        bNormBx=sB.x;bNormBy=sB.y;
        if(Math.hypot(bNormAx,bNormAy)<0.1||Math.hypot(bNormBx,bNormBy)<0.1)useU135=false;
      }else
        useU135=false;
    }
    if(!useU135){
      bNormAx=bChord.x*tsA;bNormAy=bChord.y*tsA;
      bNormBx=bChord.x*tsB;bNormBy=bChord.y*tsB;
    }
    sideA=useU135
      ?(p)=>signedMetersChordPerpAtAGate5nm(latA,lonA,p.lat,p.lon,bNormAx,bNormAy)*tsA
      :(p)=>signedMetersChordPerpAtAGate5nm(latA,lonA,p.lat,p.lon,bNormAx,bNormAy);
    sideB=useU135
      ?(p)=>signedMetersChordPerpAtBGate5nm(latB,lonB,p.lat,p.lon,bNormBx,bNormBy)*tsB
      :(p)=>signedMetersChordPerpAtBGate5nm(latB,lonB,p.lat,p.lon,bNormBx,bNormBy);
    const cArF=firstPerpCrossingWithNeg(pts,sF,jEnd,sideA);
    cA=cArF.idx;
    if(cA<0)return{startIdx:fbStart,endIdx:fbEnd,roundingM:0,startLineDistanceSignedM:null,legPathDef:"closest",roundingKind:null,gateDebug:{fail:"no_gate_crossing_at_leg_A",cAIdx:null,cBIdx:null,searchFrom:sF,legFallback:"chord_perp_5nm"}};
    const cBrF=firstPerpCrossingWithNeg(pts,cA,jEnd,sideB);
    cB=cBrF.idx;
    if(cB<0||cB<=cA)return{startIdx:fbStart,endIdx:fbEnd,roundingM:0,startLineDistanceSignedM:null,legPathDef:"closest",roundingKind:null,gateDebug:{fail:"no_gate_crossing_at_leg_B",cAIdx:cA,cBIdx:null,searchFrom:sF,legFallback:"chord_perp_5nm"}};
    }
  }
  if(cB-cA+1<LEG_MIN_TRACK_POINTS)return{startIdx:fbStart,endIdx:fbEnd,roundingM:0,startLineDistanceSignedM:null,legPathDef:"closest",roundingKind:null,gateDebug:{fail:"leg_gate_window_too_few_points",cAIdx:cA,cBIdx:cB,searchFrom:sF,mapLeg:mapLegOk}};
  let jSf=-1;
  if(String(fromMark||"")==="START"&&hasSf)
    jSf=mapLegOk?cA:firstCommitteeLineSegmentCrossing(pts,sF,Math.min(cB,jEnd),e0,e1);
  let legStartIdx=cA;
  if(String(fromMark||"")==="START"&&jSf>=0&&jSf<cB&&(cB-jSf+1)>=LEG_MIN_TRACK_POINTS)legStartIdx=jSf;
  if(cB-legStartIdx+1<LEG_MIN_TRACK_POINTS)return{startIdx:fbStart,endIdx:fbEnd,roundingM:0,startLineDistanceSignedM:null,legPathDef:"closest",roundingKind:null,gateDebug:{fail:"leg_gate_window_too_few_points",cAIdx:cA,cBIdx:cB,jSf,legStartIdx,legGatePts:cB-legStartIdx+1,mapLeg:mapLegOk}};
  let roundingM=0,roundingKind=null,startLineDistanceSignedM=null;
  if(String(fromMark||"")==="START"&&hasSf){
    if(jSf>=0){
      const p0=pts[jSf-1],p1=pts[jSf];
      const hitSf=finiteCommitteeSegmentCrossingBetweenEnds(p0,p1,e0,e1);
      const onLine=hitSf?{lat:hitSf.lat,lon:hitSf.lon}:interpolateTrackSegmentToLineLL(p0,p1,e0.lat,e0.lon,e1.lat,e1.lon);
      const cog=segmentHeadingForCrossing(pts,jSf)??bear(p0.lat,p0.lon,p1.lat,p1.lon);
      const f=Number(gpsToBowM)||0;
      const bow=f>0.05?destinationPoint(onLine.lat,onLine.lon,cog,f):{lat:onLine.lat,lon:onLine.lon};
      startLineDistanceSignedM=signedDistanceToCommitteeLineM(bow.lat,bow.lon,e0,e1,latB,lonB);
    }else{
      const prIdx=Math.max(0, cA-1);
      const bow=gpsPositionToBow(pts,prIdx,Number(gpsToBowM)||0)??{lat:pts[prIdx].lat,lon:pts[prIdx].lon};
      startLineDistanceSignedM=signedDistanceToCommitteeLineM(bow.lat,bow.lon,e0,e1,latB,lonB);
    }
    roundingM=0;
    roundingKind="sf_line_m";
  }else if(String(fromMark||"")!=="START"&&!mapLegOk){
    const rBefore=Math.max(1,sF+1);
    const rEnd=Math.max(rBefore, cA-1);
    const rCrosses=allPerpCrossingEnds(pts, rBefore, rEnd, sideA);
    if(rCrosses.length>=2){
      roundingM=sumPathDist(pts, rCrosses[0], rCrosses[rCrosses.length-1]);
      roundingKind="mark_path_m";
    }else{roundingM=0;roundingKind="mark_path_m";}
  }else if(String(fromMark||"")!=="START"&&mapLegOk)roundingM=0,roundingKind="map_in_out_leg_m";
  const legFbTag=mapLegOk?null:finishFallbackOk?"finish_out_committee_b":"chord_perp_5nm";
  return{startIdx:legStartIdx,endIdx:cB,roundingM,roundingKind,legPathDef:"map_gates",startLineDistanceSignedM,gatesAtA:legStartIdx,gatesAtB:cB,committeeLineCrossingIdx:jSf>=0?jSf:null,gateDebug:{ok:true,useU135:mapLegOk?null:useU135,mapLeg:mapLegOk,legFallback:legFbTag,cAIdx:cA,cBIdx:cB,jSf,jSfOnLine:jSf>=0,legGatePts:cB-legStartIdx+1,fromMark:String(fromMark||""),gateGIn:mapLegOk?gateGIn:undefined,gateGOut:mapLegOk?gateGOut:undefined,finishMapOutPlusCommittee:!!finishFallbackOk}};
}
/** Destination point (lat, lon °) from start, bearing ° clockwise from north, distance m. */
function destinationPoint(lat,lon,bearingDeg,distM){
  const δ=distM/RE,θ=bearingDeg*D;
  const φ1=lat*D,λ1=lon*D;
  const φ2=Math.asin(Math.sin(φ1)*Math.cos(δ)+Math.cos(φ1)*Math.sin(δ)*Math.cos(θ));
  let λ2=λ1+Math.atan2(Math.sin(θ)*Math.sin(δ)*Math.cos(φ1),Math.cos(δ)-Math.sin(φ1)*Math.sin(φ2));
  let lonDeg=λ2/D;
  while(lonDeg>180)lonDeg-=360;
  while(lonDeg<-180)lonDeg+=360;
  return{lat:φ2/D,lon:lonDeg};
}
/** Start line A/B straddling `origin` (lat/lon °), perpendicular to beat `upTwd`; half-length metres `halfLenM`. */
function committeeLineEndsPerpendicularToBeat(originLat,originLon,upTwd,halfLenM=30){
  const along=(Number(upTwd)+90)%360;
  const a=destinationPoint(originLat,originLon,along,halfLenM);
  const b=destinationPoint(originLat,originLon,(along+180)%360,halfLenM);
  return{endA:a,endB:b};
}
/** When there is no committee (S/F) mid, the first mark had no `prev` — use a point 500m “before” the first mark, away from the next mark, so in/out gates have valid chord geometry. */
function virtualPrevForFirstMarkApproach(curr,nextW,distM=500){
  const bCN=bear(curr.lat,curr.lon,nextW.lat,nextW.lon);
  return destinationPoint(curr.lat,curr.lon,((bCN+180)%360+360)%360,distM);
}
/** When there is no committee mid, the last mark had no `next` — extend 500m past the mark along the leg from the previous mark. */
function virtualNextAfterLastMark(prev,curr,distM=500){
  const bPC=bear(prev.lat,prev.lon,curr.lat,curr.lon);
  return destinationPoint(curr.lat,curr.lon,bPC,distM);
}
/**
 * Fills **virtual 500m** prev / next when missing so per-leg bisector geometry matches `detectMarkInboundOutboundGates`
 * (same as map overlay).
 */
function enrichLegMapCtxForGates(legMapCtx,latA,lonA,latB,lonB,fromMark,toMarkName){
  if(!legMapCtx)return null;
  const fromM=String(fromMark||"");
  const toM=String(toMarkName||"");
  if(!Number.isFinite(latA)||!Number.isFinite(lonA)||!Number.isFinite(latB)||!Number.isFinite(lonB))return{...legMapCtx};
  const a={lat:latA,lon:lonA},b={lat:latB,lon:lonB};
  let wPrev=legMapCtx.wPrev,wAfter=legMapCtx.wAfter;
  if((!wAfter||!Number.isFinite(wAfter.lat))&&fromM==="START"&&toM!=="FINISH")
    wAfter=virtualNextAfterLastMark(a,b,500);
  if((!wPrev||!Number.isFinite(wPrev.lat))&&toM==="FINISH"&&fromM!=="START")
    wPrev=virtualPrevForFirstMarkApproach(a,b,500);
  if((!wAfter||!Number.isFinite(wAfter.lat))&&fromM!=="START"&&toM!=="FINISH")
    wAfter=virtualNextAfterLastMark(a,b,500);
  if((!wPrev||!Number.isFinite(wPrev.lat))&&fromM!=="START"&&toM!=="FINISH"&&wAfter&&Number.isFinite(wAfter.lat))
    wPrev=virtualPrevForFirstMarkApproach(a,b,500);
  return{...legMapCtx,wPrev,wAfter};
}
/** Cumulative distance along pts to index nearest (tlat, tlon); returns {alongM, nearestIdx, distToMarkM}. */
function distanceAlongTrackToNearest(pts,tlat,tlon){
  if(!pts?.length)return{alongM:0,nearestIdx:0,distToMarkM:Infinity};
  let cum=0,bestD=Infinity,bestI=0,alongAtBest=0;
  for(let i=1;i<pts.length;i++){
    cum+=pts[i].dist||hav(pts[i-1].lat,pts[i-1].lon,pts[i].lat,pts[i].lon);
    const d=hav(pts[i].lat,pts[i].lon,tlat,tlon);
    if(d<bestD){bestD=d;bestI=i;alongAtBest=cum;}
  }
  const d0=hav(pts[0].lat,pts[0].lon,tlat,tlon);
  if(d0<bestD)return{alongM:0,nearestIdx:0,distToMarkM:d0};
  return{alongM:alongAtBest,nearestIdx:bestI,distToMarkM:bestD};
}
/** Format epoch seconds as local wall-clock HH:MM:SS (or null). */
function formatWallClock(epochSec){
  if(epochSec==null||!Number.isFinite(Number(epochSec)))return null;
  const s=Number(epochSec);
  const ms=s>1e12?s:s*1000;
  try{
    return new Date(ms).toLocaleTimeString(undefined,{hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false});
  }catch(_){return null;}
}
function bear(a1,o1,a2,o2){const dl=(o2-o1)*D;return((Math.atan2(Math.sin(dl)*Math.cos(a2*D),Math.cos(a1*D)*Math.sin(a2*D)-Math.sin(a1*D)*Math.cos(a2*D)*Math.cos(dl))/D)+360)%360}
function adiff(a,b){return((b-a+540)%360)-180}
const ms2k=s=>s*1.94384,m2nm=m=>m/1852;
function fT(s){if(s<0)s=0;const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),c=Math.floor(s%60);return h>0?`${h}:${String(m).padStart(2,"0")}:${String(c).padStart(2,"0")}`:`${m}:${String(c).padStart(2,"0")}`}
function sm(arr,w=5){return arr.map((_,i)=>{const s=Math.max(0,i-Math.floor(w/2)),e=Math.min(arr.length,i+Math.ceil(w/2));const sl=arr.slice(s,e);return sl.reduce((a,b)=>a+b,0)/sl.length})}

/** Trim track: startOffsetSec after first point; durationSec null/0 = to last point. */
function cropTrackPoints(pts,startOffsetSec,durationSec){
  if(!pts||pts.length<2)return pts;
  const s=[...pts].sort((a,b)=>a.time-b.time);
  const t0=s[0].time,t1=s[s.length-1].time;
  const span=Math.max(0,t1-t0);
  const off=Math.max(0,Math.min(Number(startOffsetSec)||0,span));
  const start=t0+off;
  const dur=durationSec==null||durationSec===""||Number(durationSec)<=0?null:Number(durationSec);
  const end=dur==null?t1:Math.min(start+dur,t1);
  if(end<=start)return s.slice(0,Math.min(25,s.length));
  return s.filter(p=>p.time>=start&&p.time<=end);
}

/**
 * Insert points along long segments (sparse / gappy Strava) so perp “gate” crossings are less likely
 * to be missed between samples. On by default; linear interp on lat/lon/time.
 */
function densifyGpsTrack(pts, opts){
  const maxStepM=Math.max(2,Number(opts?.maxStepM) || 5);
  const maxTimeSec=Math.max(0.3,Number(opts?.maxTimeSec) || 2);
  if(!pts||pts.length<2)return pts?[...pts]:[];
  const sorted=[...pts].sort((a,b)=>a.time-b.time);
  const out=[sorted[0]];
  for(let i=0;i<sorted.length-1;i++){
    const a=sorted[i],b=sorted[i+1];
    const d=hav(a.lat,a.lon,b.lat,b.lon);
    const dt=Math.max(0,b.time-a.time);
    const partsD=d<=0.1?1:Math.max(1,Math.ceil(d/maxStepM));
    const partsT=dt<=0.0001?1:Math.max(1,Math.ceil(dt/maxTimeSec));
    const parts=Math.max(partsD,partsT,1);
    for(let k=1;k<parts;k++){
      const u=k/parts;
      out.push({time:a.time+dt*u,lat:a.lat+(b.lat-a.lat)*u,lon:a.lon+(b.lon-a.lon)*u});
    }
    out.push(b);
  }
  return out;
}
/** Nearest `origPts` index to absolute time (sorted by time, binary search + neighbour check). */
function nearestTimeIndexInSortedGps(origPts,t){
  if(!origPts?.length)return 0;
  const t0=Number(t);
  if(!Number.isFinite(t0))return 0;
  let lo=0,hi=origPts.length-1;
  while(lo<hi){
    const mid=(lo+hi)>>1;
    if(origPts[mid].time<t0)lo=mid+1;else hi=mid;
  }
  const i=lo;
  const i0=Math.max(0,i-1);
  const d0=Math.abs(origPts[i0].time-t0),d1=Math.abs(origPts[i].time-t0);
  return d0<=d1?i0:i;
}

/** HH:MM:SS from seconds (always two-digit hours). */
function formatHMS(totalSec){
  const s=Math.max(0,Math.floor(Number(totalSec)||0));
  const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60;
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
}
/** Local wall-time window for upload title: unix **seconds** (GPX/FIT points may use ms — normalize first). */
function formatRecordingWindowLabel(tStartSec,tEndSec){
  const ts=Number(tStartSec),te=Number(tEndSec);
  if(!Number.isFinite(ts)||!Number.isFinite(te)||te<ts)return"";
  const a=new Date(ts*1000),b=new Date(te*1000);
  const sameDay=a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate();
  const clock={hour:"2-digit",minute:"2-digit",hour12:false};
  const t0=a.toLocaleTimeString(undefined,clock);
  const t1=b.toLocaleTimeString(undefined,clock);
  if(sameDay)return`${t0}–${t1}`;
  const stamp={month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",hour12:false};
  return`${a.toLocaleString(undefined,stamp)} – ${b.toLocaleString(undefined,stamp)}`;
}
/** Parse HH:MM:SS, MM:SS, or seconds; invalid → null. */
function parseHMS(str){
  const t=String(str).trim();
  if(t==="")return null;
  const parts=t.split(":").map(p=>p.trim());
  if(parts.length===0||parts.length>3)return null;
  for(const p of parts){ if(p==="")return null; if(!/^\d+$/.test(p))return null; }
  const n=parts.map(p=>parseInt(p,10));
  if(n.length===3)return n[0]*3600+n[1]*60+n[2];
  if(n.length===2)return n[0]*60+n[1];
  return n[0];
}
/** Parse "lat, lon" or "lat lon" (decimal degrees). Returns {lat,lon} or null. */
function parseLatLonPair(str){
  const t=String(str).trim();
  if(!t)return null;
  const parts=t.split(/[\s,]+/).map(s=>s.trim()).filter(Boolean);
  if(parts.length<2)return null;
  const lat=parseFloat(parts[0]),lon=parseFloat(parts[1]);
  if(!Number.isFinite(lat)||!Number.isFinite(lon))return null;
  if(Math.abs(lat)>90||Math.abs(lon)>180)return null;
  return{lat,lon};
}
/** Local tangent-plane metres from ref (small area). */
function latLonToLocalM(lat,lon,refLat,refLon){
  const y=(lat-refLat)*111320;
  const x=(lon-refLon)*111320*Math.cos(refLat*D);
  return{x,y};
}
/** Min distance (m) from point to segment AB in local plane around ref. */
function distPointToSegmentM(lat,lon,aLat,aLon,bLat,bLon){
  const refLat=(aLat+bLat)/2,refLon=(aLon+bLon)/2;
  const p=latLonToLocalM(lat,lon,refLat,refLon);
  const A=latLonToLocalM(aLat,aLon,refLat,refLon);
  const B=latLonToLocalM(bLat,bLon,refLat,refLon);
  const abx=B.x-A.x,aby=B.y-A.y,apx=p.x-A.x,apy=p.y-A.y;
  const den=abx*abx+aby*aby;
  const t=den<1e-8?0:Math.max(0,Math.min(1,(apx*abx+apy*aby)/den));
  const qx=A.x+t*abx,qy=A.y+t*aby;
  return Math.hypot(p.x-qx,p.y-qy);
}

function lineSideValue(lat,lon,aLat,aLon,bLat,bLon){
  const refLat=(aLat+bLat)/2,refLon=(aLon+bLon)/2;
  const p=latLonToLocalM(lat,lon,refLat,refLon);
  const a=latLonToLocalM(aLat,aLon,refLat,refLon);
  const b=latLonToLocalM(bLat,bLon,refLat,refLon);
  const abx=b.x-a.x,aby=b.y-a.y,apx=p.x-a.x,apy=p.y-a.y;
  return abx*apy-aby*apx;
}
/** Parameter t (0=A, 1=B) where P projects onto the **infinite** line A→B; >1 = past B, <0 = past A. NaN if A≡B. */
function pointFractionAlongABLine(pLat,pLon,aLat,aLon,bLat,bLon){
  const refLat=(aLat+bLat)/2,refLon=(aLon+bLon)/2;
  const A=latLonToLocalM(aLat,aLon,refLat,refLon);
  const B=latLonToLocalM(bLat,bLon,refLat,refLon);
  const P=latLonToLocalM(pLat,pLon,refLat,refLon);
  const abx=B.x-A.x,aby=B.y-A.y;
  const den=abx*abx+aby*aby;
  if(den<1e-9)return NaN;
  return((P.x-A.x)*abx+(P.y-A.y)*aby)/den;
}
/** Sailing line gate: P must project **between** A and B (committee marks). Tolerance in metres along the chord. */
function pointProjectsBetweenAB(pLat,pLon,aLat,aLon,bLat,bLon,tolM=0){
  const t=pointFractionAlongABLine(pLat,pLon,aLat,aLon,bLat,bLon);
  if(!Number.isFinite(t))return false;
  if(!(tolM>0))return t>=0&&t<=1;
  const refLat=(aLat+bLat)/2,refLon=(aLon+bLon)/2;
  const A=latLonToLocalM(aLat,aLon,refLat,refLon);
  const B=latLonToLocalM(bLat,bLon,refLat,refLon);
  const L=Math.hypot(B.x-A.x,B.y-A.y);
  if(L<1e-3)return false;
  const u=tolM/L;
  return t>=-u&&t<=1+u;
}
/**
 * Long segment from the mark along the map gate (°T), like committee A–B: same **infinite** line for side tests as `lineSideValue` / Start line. 5nm default.
 * @see `firstCommitteeLineSegmentCrossing`
 */
/** Long segment from mark along gate bearing — matches infinite-line side tests (Start, map leg gates). */
const MARK_GATE_LINE_ARM_M=5*1852;
/** Map overlay only: short ray so magenta gates read as local rounding aids, not multi-nm lines through other marks. */
const MARK_GATE_MAP_DRAW_ARM_M=220;
function markGateSegmentEndsFromBearingTwd(markLat,markLon,bearingTwd,armM=MARK_GATE_LINE_ARM_M){
  const br=Number(bearingTwd);
  if(!Number.isFinite(br)||!Number.isFinite(markLat)||!Number.isFinite(markLon))return null;
  const b=destinationPoint(markLat,markLon,br%360,Math.max(10,armM));
  return{aLat:markLat,aLon:markLon,bLat:b.lat,bLon:b.lon,armM};
}
/** Signed perpendicular distance (m) to the infinite line through A–B; same construction as `lineSideValue` / Start (cross / |AB| in local m). */
function signedMetersToABLineLikeCommittee(pLat,pLon,aLat,aLon,bLat,bLon){
  const s=lineSideValue(pLat,pLon,aLat,aLon,bLat,bLon);
  const refLat=(aLat+bLat)/2,refLon=(aLon+bLon)/2;
  const a=latLonToLocalM(aLat,aLon,refLat,refLon);
  const b=latLonToLocalM(bLat,bLon,refLat,refLon);
  const L=Math.hypot(b.x-a.x,b.y-a.y);
  if(L<0.1)return 0;
  return s/L;
}
/** Signed m to rounding bisector line at `curr`; `bearingDeg` = bisector ray (°T) from `computeRoundingOutsideBisectorBearingDeg`. */
function signedMetersToRoundingBisectorAtMark(pLat,pLon,markLat,markLon,bearingDeg){
  const g=markGateSegmentEndsFromBearingTwd(markLat,markLon,bearingDeg,MARK_GATE_LINE_ARM_M);
  if(!g)return NaN;
  return signedMetersToABLineLikeCommittee(pLat,pLon,g.aLat,g.aLon,g.bLat,g.bLon);
}
/**
 * ~80 m on outbound port beam (P: `out−90°`) vs starboard beam (S: `out+90°`).
 * Orient the infinite bisector (same underlying line either way): flip **`br0` by 180°** when the beam ref lands on
 * the **positive** signed (`s>0`) committee-style half-plane — **`signedMetersToABLineLikeCommittee`** and the old
 * `s<0` flip were consistently inverted vs the map/gate visuals for both tack labels; one rule fixes P & S alike.
 */
const ORIENT_ROUNDING_REF_M=80;
function orientRoundingRayForPortStarboard(br0,currLat,currLon,nextLat,nextLon,tack){
  if((tack!=="P"&&tack!=="S")||br0==null||!Number.isFinite(br0))return br0;
  const out=bear(currLat,currLon,nextLat,nextLon);
  if(!Number.isFinite(out))return br0;
  const beamBr=((tack==="P"?out-90:out+90)%360+360)%360;
  const ref=destinationPoint(currLat,currLon,beamBr,ORIENT_ROUNDING_REF_M);
  const g=markGateSegmentEndsFromBearingTwd(currLat,currLon,br0,MARK_GATE_LINE_ARM_M);
  if(!g)return br0;
  const s=signedMetersToABLineLikeCommittee(ref.lat,ref.lon,g.aLat,g.aLon,g.bLat,g.bLon);
  if(!Number.isFinite(s)||Math.abs(s)<1e-4)return br0;
  return s>=0?((br0+180)%360):br0;
}
function roundingBisectorSideFn(prev,curr,next,tack){
  const br=computeRoundingOutsideBisectorBearingDeg(prev,curr,next,tack);
  if(br==null||!Number.isFinite(br))return()=>0;
  return pp=>signedMetersToRoundingBisectorAtMark(pp.lat,pp.lon,curr.lat,curr.lon,br);
}
/**
 * Chord-⊥ leg fallback: same **infinite** line as `sideValuePerpAtAChordEnuA` / `sideValuePerpAtBChordEnuA`, but
 * signed distance via 5nm segment + `signedMetersToABLineLikeCommittee` (par with Start / map mark gates).
 */
function signedMetersChordPerpAtAGate5nm(latA,lonA,latP,lonP,bEnuX,bEnuY){
  const L=Math.hypot(bEnuX,bEnuY);
  if(L<0.1)return 0;
  const tx=-bEnuY/L,ty=bEnuX/L;
  const brT=((Math.atan2(tx,ty)*180/Math.PI)+360)%360;
  const g=markGateSegmentEndsFromBearingTwd(latA,lonA,brT,MARK_GATE_LINE_ARM_M);
  if(!g)return 0;
  return signedMetersToABLineLikeCommittee(latP,lonP,g.aLat,g.aLon,g.bLat,g.bLon);
}
function signedMetersChordPerpAtBGate5nm(latB,lonB,latP,lonP,bNormX,bNormY){
  const L=Math.hypot(bNormX,bNormY);
  if(L<0.1)return 0;
  const tx=-bNormY/L,ty=bNormX/L;
  const brT=((Math.atan2(tx,ty)*180/Math.PI)+360)%360;
  const g=markGateSegmentEndsFromBearingTwd(latB,lonB,brT,MARK_GATE_LINE_ARM_M);
  if(!g)return 0;
  return signedMetersToABLineLikeCommittee(latP,lonP,g.aLat,g.aLon,g.bLat,g.bLon);
}
/**
 * Project GPS forward to bow: along COG (° T) or segment bearing, by `forwardM` (m, ≥0).
 * Used to offset antenna to bow for S/F and gate distances.
 */
function gpsPositionToBow(pts,idx,forwardM){
  if(!pts?.length||!(forwardM>0.05))return null;
  const j=Math.max(0,Math.min(pts.length-1,idx|0));
  const p=pts[j];
  if(!p)return null;
  let cog=p.cog;
  if(!Number.isFinite(cog)&&j>0){
    const a=pts[j-1];
    cog=bear(a.lat,a.lon,p.lat,p.lon);
  }
  if(!Number.isFinite(cog))return{lat:p.lat,lon:p.lon};
  return destinationPoint(p.lat,p.lon,cog,forwardM);
}
/** S/F segment: negative = course side of line (same side as ref mark), positive = pre-line side. */
function signedDistanceToCommitteeLineM(bLat,bLon,e0,e1,refLat,refLon){
  const d=distPointToSegmentM(bLat,bLon,e0.lat,e0.lon,e1.lat,e1.lon);
  if(!Number.isFinite(d))return 0;
  const sB=lineSideValue(bLat,bLon,e0.lat,e0.lon,e1.lat,e1.lon);
  const sR=lineSideValue(refLat,refLon,e0.lat,e0.lon,e1.lat,e1.lon);
  if(!Number.isFinite(sB)||!Number.isFinite(sR)||sR===0||sB===0)return d;
  const same=(sB*sR)>0;
  return same?-d:d;
}

/** First index j (second point of segment j-1→j) where the track chord crosses the **finite** SFA–SFB segment. */
function firstCommitteeLineSegmentCrossing(pts,iStart,jEnd,endA,endB){
  if(!pts?.length||!endA||!endB)return-1;
  const s0=Math.max(0,Math.floor(iStart|0));
  const e=Math.min(jEnd|0,pts.length-1);
  for(let j=Math.max(1,s0+1);j<=e;j++){
    const a=pts[j-1],b=pts[j];
    if(finiteCommitteeSegmentCrossingBetweenEnds(a,b,endA,endB))return j;
  }
  return-1;
}
/** Intersection of track segment p0–p1 with the infinite line through endA–endB; returns a point on the track segment. */
function interpolateTrackSegmentToLineLL(p0,p1,endA,endB){
  const refLat=(p0.lat+p1.lat+endA.lat+endB.lat)/4,refLon=(p0.lon+p1.lon+endA.lon+endB.lon)/4;
  const P0=latLonToLocalM(p0.lat,p0.lon,refLat,refLon);
  const P1=latLonToLocalM(p1.lat,p1.lon,refLat,refLon);
  const A=latLonToLocalM(endA.lat,endA.lon,refLat,refLon);
  const B=latLonToLocalM(endB.lat,endB.lon,refLat,refLon);
  const vx=P1.x-P0.x,vy=P1.y-P0.y;
  const wx=B.x-A.x,wy=B.y-A.y;
  const apx=P0.x-A.x,apy=P0.y-A.y;
  const den=vx*wy-vy*wx;
  if(Math.abs(den)<1e-14)return{lat:(p0.lat+p1.lat)/2,lon:(p0.lon+p1.lon)/2};
  const t=(apx*wy-apy*wx)/den;
  const tCl=Math.max(0,Math.min(1,t));
  const ix=P0.x+tCl*vx,iy=P0.y+tCl*vy;
  return{lat:refLat+iy/111320,lon:refLon+ix/(111320*Math.cos(refLat*D))};
}

/** Intersection of GPS chord P0→P1 with **finite** committee segment A→B (SFA–SFB only; not the infinite extension). */
function finiteCommitteeSegmentCrossingBetweenEnds(p0,p1,endA,endB){
  if(!p0||!p1||!endA||!endB)return null;
  const refLat=(p0.lat+p1.lat+endA.lat+endB.lat)/4,refLon=(p0.lon+p1.lon+endA.lon+endB.lon)/4;
  const P0=latLonToLocalM(p0.lat,p0.lon,refLat,refLon);
  const P1=latLonToLocalM(p1.lat,p1.lon,refLat,refLon);
  const A=latLonToLocalM(endA.lat,endA.lon,refLat,refLon);
  const B=latLonToLocalM(endB.lat,endB.lon,refLat,refLon);
  const rx=B.x-A.x,ry=B.y-A.y;
  const dx=P1.x-P0.x,dy=P1.y-P0.y;
  const fx=P0.x-A.x,fy=P0.y-A.y;
  const den=rx*dy-ry*dx;
  if(Math.abs(den)<1e-12)return null;
  const u=(fx*dy-fy*dx)/den;
  const t=(fx*ry-fy*rx)/den;
  const EPS=1e-7;
  if(u<-EPS||u>1+EPS||t<-EPS||t>1+EPS)return null;
  const tCl=Math.max(0,Math.min(1,t));
  const ix=P0.x+tCl*dx,iy=P0.y+tCl*dy;
  return{
    tTrack:tCl,
    uComm:Math.max(0,Math.min(1,u)),
    lat:refLat+iy/111320,
    lon:refLon+ix/(111320*Math.cos(refLat*D)),
  };
}

function interpolatePointByTime(pts,targetTime){
  if(!pts?.length)return null;
  if(targetTime<=pts[0].time)return{lat:pts[0].lat,lon:pts[0].lon,time:pts[0].time};
  if(targetTime>=pts[pts.length-1].time)return{lat:pts[pts.length-1].lat,lon:pts[pts.length-1].lon,time:pts[pts.length-1].time};
  for(let i=1;i<pts.length;i++){
    const a=pts[i-1],b=pts[i];
    if(targetTime<b.time){
      const span=Math.max(1e-6,b.time-a.time),u=(targetTime-a.time)/span;
      return{lat:a.lat+(b.lat-a.lat)*u,lon:a.lon+(b.lon-a.lon)*u,time:targetTime};
    }
  }
  return null;
}

/** SOG (kts) at absolute time, linearly in `ss` between GPS samples. */
function speedKtsAtTime(pts,tAbs){
  if(!pts?.length||!Number.isFinite(tAbs))return null;
  if(tAbs<=pts[0].time)return ms2k(pts[0].ss||0);
  if(tAbs>=pts[pts.length-1].time)return ms2k(pts[pts.length-1].ss||0);
  for(let i=1;i<pts.length;i++){
    if(tAbs<=pts[i].time){
      const a=pts[i-1],b=pts[i];
      const u=(tAbs-a.time)/Math.max(1e-6,b.time-a.time);
      return ms2k((a.ss||0)+u*((b.ss||0)-(a.ss||0)));
    }
  }
  return null;
}

function clockSecondsFromUnix(unixSec){
  const d=new Date(unixSec*1000);
  return d.getHours()*3600+d.getMinutes()*60+d.getSeconds();
}

function nearestPointIndexByClockTime(pts,targetClockSec){
  if(!pts?.length)return-1;
  if(targetClockSec==null||!Number.isFinite(targetClockSec))return-1;
  let bestIdx=0,bestDiff=Infinity;
  for(let i=0;i<pts.length;i++){
    const s=clockSecondsFromUnix(pts[i].time);
    const d=Math.abs(s-targetClockSec);
    const diff=Math.min(d,86400-d);
    if(diff<bestDiff){bestDiff=diff;bestIdx=i;}
  }
  return bestIdx;
}

/** Grid step (s) across the segment window bracketing a committee crossing; ~0.5 s target. */
const LINE_CROSS_REFINE_STEP_SEC=0.5;
/** Stop bisection refine when |signed perpendicular distance| ≤ this (≈10 cm). */
const LINE_CROSS_REFINE_DIST_SNAP_M=0.1;
/** Densify before committee-line crossing search: shallow finishes barely move ⊥ to the line between samples. */
const LINE_CROSS_DENSIFY_MAX_STEP_M=1.5;
const LINE_CROSS_DENSIFY_MAX_TIME_SEC=0.45;

/**
 * Zero-crossing time (unix s) of signed distance-to-infinite-line (meters) sampled on a 0.5 s time grid across
 * the segment window [segJ-2→segJ+1] (three chords). On sign change, linear estimate then bisection to
 * `LINE_CROSS_REFINE_DIST_SNAP_M`. Keeps coarse geometric fallback if the bracket does not straddle zero.
 */
function refinedInfinityLineCrossUnixTime(pts,segJ,signedMetersAt,stepSec,fallbackUnix){
  if(!pts||pts.length<2||segJ<1||segJ>=pts.length||typeof signedMetersAt!=="function")return fallbackUnix??null;
  const iLo=Math.max(0,segJ-3),iHi=Math.min(pts.length-1,segJ+2);
  const tA=pts[iLo].time,tB=pts[iHi].time;
  if(!(tB>tA)||!Number.isFinite(fallbackUnix))return fallbackUnix??null;
  const step=Math.max(0.1,Math.min(2,Number(stepSec)||LINE_CROSS_REFINE_STEP_SEC));
  const pStart=interpolatePointByTime(pts,tA);
  if(!pStart)return fallbackUnix??null;
  let tPrev=tA,dPrev=signedMetersAt(pStart.lat,pStart.lon);
  if(!Number.isFinite(dPrev))return fallbackUnix;
  for(let t=tA+step;t<=tB+1e-9;t+=step){
    const tt=Math.min(t,tB);
    const pm=interpolatePointByTime(pts,tt);
    if(!pm)break;
    const dm=signedMetersAt(pm.lat,pm.lon);
    if(!Number.isFinite(dm))break;
    if(dm===0||(dPrev!==0&&dPrev*dm<=0)){
      let lo=tPrev,hi=tt,flo=dPrev;
      const denom=dm-dPrev;
      let tMid=Math.abs(denom)>1e-14?tPrev+(tt-tPrev)*(-dPrev)/denom:(tPrev+tt)*0.5;
      for(let k=0;k<18;k++){
        const pm=interpolatePointByTime(pts,tMid);
        if(!pm)return fallbackUnix;
        const fm=signedMetersAt(pm.lat,pm.lon);
        if(!Number.isFinite(fm))return fallbackUnix;
        if(Math.abs(fm)<=LINE_CROSS_REFINE_DIST_SNAP_M)return tMid;
        if(fm===0)break;
        if(flo!==0&&Math.sign(fm)===Math.sign(flo)){lo=tMid;flo=fm;}
        else hi=tMid;
        tMid=(lo+hi)*0.5;
      }
      return tMid;
    }
    tPrev=tt;dPrev=dm;
  }
  return fallbackUnix;
}

function refinedCommitteeLineCrossUnixTime(pts,segJ,endA,endB){
  const coarse=interpolatedCommitteeLineCrossingTimeCoarse(pts,segJ,endA,endB);
  if(coarse==null||!Number.isFinite(coarse))return coarse;
  const TOL_ALONG_M=1;
  const fn=(la,lo)=>{
    if(!pointProjectsBetweenAB(la,lo,endA.lat,endA.lon,endB.lat,endB.lon,TOL_ALONG_M))return NaN;
    return signedMetersToABLineLikeCommittee(la,lo,endA.lat,endA.lon,endB.lat,endB.lon);
  };
  const r=refinedInfinityLineCrossUnixTime(pts,segJ,fn,LINE_CROSS_REFINE_STEP_SEC,coarse);
  return r!=null&&Number.isFinite(r)?r:coarse;
}

function detectLineCrossings(pts,endA,endB){
  const out=[];
  if(!pts||pts.length<2||!endA||!endB)return out;
  for(let i=1;i<pts.length;i++){
    const p1=pts[i-1],p2=pts[i];
    const hit=finiteCommitteeSegmentCrossingBetweenEnds(p1,p2,endA,endB);
    if(!hit)continue;
    const coarse=p1.time+(p2.time-p1.time)*hit.tTrack;
    const s1=lineSideValue(p1.lat,p1.lon,endA.lat,endA.lon,endB.lat,endB.lon);
    const s2=lineSideValue(p2.lat,p2.lon,endA.lat,endA.lon,endB.lat,endB.lon);
    const TOL_ALONG_M=1;
    const fn=(la,lo)=>{
      if(!pointProjectsBetweenAB(la,lo,endA.lat,endA.lon,endB.lat,endB.lon,TOL_ALONG_M))return NaN;
      return signedMetersToABLineLikeCommittee(la,lo,endA.lat,endA.lon,endB.lat,endB.lon);
    };
    const t=refinedInfinityLineCrossUnixTime(pts,i,fn,LINE_CROSS_REFINE_STEP_SEC,coarse)??coarse;
    const dir=Number.isFinite(s1)&&Number.isFinite(s2)&&s2>s1?"A→B":"B→A";
    out.push({time:t,direction:dir,idx:i});
  }
  return out;
}

/** Coarse chord crossing (segment plane); used as seed for `refinedCommitteeLineCrossUnixTime`. */
function interpolatedCommitteeLineCrossingTimeCoarse(pts,segP2Idx,endA,endB){
  if(!pts||segP2Idx<1||segP2Idx>=pts.length||!endA||!endB)return null;
  const p1=pts[segP2Idx-1],p2=pts[segP2Idx];
  const hit=finiteCommitteeSegmentCrossingBetweenEnds(p1,p2,endA,endB);
  if(!hit)return null;
  return p1.time+(p2.time-p1.time)*hit.tTrack;
}
/** Interpolated crossing time (Unix s) for segment p[segP2Idx-1]→p[segP2Idx]; refined via 0.5 s grid + linear zero-cross on signed perpendicular distance (m). */
function interpolatedCommitteeLineCrossingTime(pts,segP2Idx,endA,endB){
  return refinedCommitteeLineCrossUnixTime(pts,segP2Idx,endA,endB);
}

/** Bow at absolute unix time: linear track interp + segment COG (same as sample-based `gpsPositionToBow`). */
function gpsPositionToBowAtTime(pts,tAbs,forwardM){
  if(!pts?.length||!Number.isFinite(tAbs))return null;
  const p=interpolatePointByTime(pts,tAbs);
  if(!p)return null;
  if(!(forwardM>0.05))return{lat:p.lat,lon:p.lon};
  for(let i=1;i<pts.length;i++){
    const a=pts[i-1],b=pts[i];
    if(tAbs>=a.time&&tAbs<=b.time){
      const cog=bear(a.lat,a.lon,b.lat,b.lon);
      if(!Number.isFinite(cog))return{lat:p.lat,lon:p.lon};
      return destinationPoint(p.lat,p.lon,cog,forwardM);
    }
  }
  const j=nearestTimeIndexInSortedGps(pts,tAbs);
  return gpsPositionToBow(pts,j,forwardM);
}

const GUN_CLOCK_REFINE_PAD_SEC=120;
/**
 * Refine unix time on the track whose clock-of-day best matches `raceClockSec` (0…86400), on a 0.5 s raster.
 * Uses a ±`GUN_CLOCK_REFINE_PAD_SEC` s wall-time window around the seed index (±2 GPS points was too narrow for Hz rates or drift).
 */
function refinedUnixGunFromClockNearby(pts,raceClockSec,idxGuess){
  if(!pts?.length||!Number.isFinite(raceClockSec))return null;
  const si=Math.max(0,Math.min(pts.length-1,idxGuess|0));
  const mid=pts[si].time;
  const pad=GUN_CLOCK_REFINE_PAD_SEC;
  let ta=mid-pad,tb=mid+pad;
  const t0=pts[0].time,t1=pts[pts.length-1].time;
  ta=Math.max(t0,ta);tb=Math.min(t1,tb);
  if(!(tb>ta))return null;
  let bestT=null,best=null;
  for(let u=ta;u<=tb+1e-9;u+=LINE_CROSS_REFINE_STEP_SEC){
    const tt=Math.min(u,tb);
    const cs=clockSecondsFromUnix(tt);
    const d0=Math.abs(cs-raceClockSec);
    const diff=Math.min(d0,86400-d0);
    if(best==null||diff<best){best=diff;bestT=tt;}
  }
  return bestT;
}

/** Course row: string name or [name, "P"|"S"] from Course Selector */
function parseMarkSpec(row){
  if(Array.isArray(row)&&row.length)return{name:String(row[0]),tack:row[1]==="P"||row[1]==="S"?row[1]:null};
  if(typeof row==="string"&&row)return{name:row,tack:null};
  return{name:"",tack:null};
}
function formatCourseRow(row){
  const r=parseMarkSpec(row);
  return r.tack?`${r.name} (${r.tack})`:r.name;
}

/* ═══════════════════════════════════════════════════════════════════
   WSC MARK DATABASE — GPS March 2026 (same as WSC Course Selector app)
   ═══════════════════════════════════════════════════════════════════ */
const WSC_MARKS={
  "START/FINISH":{lat:50.85151,lon:-1.30851,fixed:true,desc:"Committee line"},
  "BUOY 11":{lat:50.84878,lon:-1.30796,fixed:true},
  "PILE 1":{lat:50.83904,lon:-1.31060,fixed:true},
  "PILE 2":{lat:50.83991,lon:-1.31280,fixed:true},
  "PILE 3":{lat:50.84081,lon:-1.31075,fixed:true},
  "PILE 4":{lat:50.84155,lon:-1.31376,fixed:true},
  "PILE 5":{lat:50.84231,lon:-1.31192,fixed:true},
  "PILE 6":{lat:50.84378,lon:-1.31383,fixed:true},
  "PILE 7":{lat:50.84333,lon:-1.31151,fixed:true},
  "PILE 8":{lat:50.84544,lon:-1.31176,fixed:true},
  "PILE 9":{lat:50.84635,lon:-1.30927,fixed:true},
  "PILE 10":{lat:50.84831,lon:-1.30974,fixed:true},
  "WARSASH SC":{lat:50.8435,lon:-1.3207,fixed:true},
  "HAMBLE PT":{lat:50.8358,lon:-1.3110,fixed:true},
  "BALD HEAD":{lat:50.8300,lon:-1.3012,fixed:true},
  "WILLIAM":{lat:50.8277,lon:-1.2932,fixed:true},
  "CORONATION":{lat:50.8258,lon:-1.2937,fixed:true},
  "CHIEFTAIN TR":{lat:50.8242,lon:-1.2818,fixed:true},
  "FUMESY":{lat:50.8202,lon:-1.2910,fixed:true},
  "LAID MK A":{lat:50.83733,lon:-1.31583,fixed:false,desc:"Laid mark A"},
  "LAID MK B":{lat:50.83494,lon:-1.30201,fixed:false,desc:"Laid mark B"},
  "LAID MK C":{lat:50.84948,lon:-1.31796,fixed:false,desc:"Laid mark C"},
  "LAID MK D":{lat:50.82394,lon:-1.29986,fixed:false,desc:"Laid mark D"},
};

/* ═══════════════════════════════════════════════════════════════════
   WSC COURSE DATABASE — 2026/27 (WSC Course Selector)
   marks / marksPreamble: [markName, "P"|"S"] = port / starboard rounding
   Custom courses use `customCourseRecipe` (builder UI), not `marks` here.
   ═══════════════════════════════════════════════════════════════════ */
const WSC_COURSES={
  "A":{name:"A — SC",marks:[["BUOY 11","S"],["PILE 6","S"],["PILE 10","S"]],type:"SC"},
  "B":{name:"B — SC",marks:[["PILE 2","P"],["PILE 3","P"],["PILE 10","P"]],type:"SC"},
  "C":{name:"C — SC",marks:[["BUOY 11","S"],["PILE 1","S"],["PILE 2","S"]],type:"SC"},
  "D":{name:"D — SC (HW)",marks:[["PILE 2","S"],["WARSASH SC","S"],["PILE 10","S"]],type:"SC"},
  "E":{name:"E — SC (HW)",marks:[["PILE 10","P"],["WARSASH SC","P"],["PILE 2","P"]],type:"SC"},
  "F":{name:"F — SC",marks:[["PILE 2","S"],["LAID MK A","P"],["HAMBLE PT","P"],["PILE 5","P"]],type:"SC"},
  "G":{name:"G — SC",marks:[["PILE 5","S"],["HAMBLE PT","S"],["LAID MK A","S"],["PILE 2","P"]],type:"SC"},
  "H":{name:"H — SC (HW)",marks:[["PILE 10","P"],["WARSASH SC","P"],["HAMBLE PT","P"]],type:"SC"},
  "I":{name:"I — SC (HW)",marks:[["HAMBLE PT","S"],["WARSASH SC","S"],["PILE 10","S"]],type:"SC"},
  "J":{name:"J — SC",marks:[["PILE 3","S"],["BALD HEAD","S"],["HAMBLE PT","S"]],type:"SC"},
  "K":{name:"K — SC",marks:[["HAMBLE PT","P"],["BALD HEAD","P"],["PILE 3","P"]],type:"SC"},
  "M":{name:"M — SC (avoid LW)",marks:[["LAID MK B","S"],["HAMBLE PT","S"],["LAID MK B","S"],["HAMBLE PT","S"],["PILE 2","S"]],marksPreamble:[["PILE 3","P"]],type:"SC"},
  "N":{name:"N — SC",marks:[["PILE 5","S"],["HAMBLE PT","S"],["WARSASH SC","S"],["PILE 2","P"]],type:"SC"},
  "P":{name:"P — SC",marks:[["PILE 2","S"],["WARSASH SC","P"],["HAMBLE PT","P"],["PILE 5","P"]],type:"SC"},
  "Q":{name:"Q — SC (HW)",marks:[["LAID MK C","P"],["WARSASH SC","P"],["PILE 2","P"]],marksPreamble:[["PILE 2","S"]],type:"SC"},
  "R":{name:"R — MC (HW)",marks:[["PILE 2","S"],["WARSASH SC","S"],["PILE 10","S"]],type:"MC"},
  "S":{name:"S — MC",marks:[["WILLIAM","S"],["LAID MK D","S"],["HAMBLE PT","S"]],marksPreamble:[["HAMBLE PT","P"]],type:"MC"},
  "T":{name:"T — MC",marks:[["BALD HEAD","P"],["CORONATION","P"],["WILLIAM","P"]],marksPreamble:[["HAMBLE PT","P"]],type:"MC"},
  "U":{name:"U — MC",marks:[["WILLIAM","S"],["CORONATION","S"],["HAMBLE PT","S"]],marksPreamble:[["HAMBLE PT","P"]],type:"MC"},
  "V":{name:"V — LC",marks:[["CHIEFTAIN TR","S"],["FUMESY","S"]],marksPreamble:[["HAMBLE PT","P"]],type:"LC"},
  "W":{name:"W — LC",marks:[["WILLIAM","S"],["CHIEFTAIN TR","S"],["FUMESY","S"]],marksPreamble:[["HAMBLE PT","P"]],type:"LC"},
  "X":{name:"X — LC",marks:[["FUMESY","P"],["CHIEFTAIN TR","P"],["WILLIAM","P"]],marksPreamble:[["HAMBLE PT","P"]],type:"LC"},
  "Y":{name:"Y — LC",marks:[["WILLIAM","S"],["CORONATION","P"],["CHIEFTAIN TR","S"],["FUMESY","S"],["BALD HEAD","S"]],marksPreamble:[["HAMBLE PT","P"]],type:"LC"},
  "CUSTOM":{name:"Custom — build your course",marks:[],type:"custom"},
};

/** Default custom builder recipe (persisted in `course_setup.customCourseRecipe`). */
const DEFAULT_CUSTOM_COURSE_RECIPE={lineMode:"both",portN:0,stbdN:0,gatePairs:0,sfLapCrossingCrop:false};

/** 0.5 nm diameter → radius for initial mark ring (m). */
const CUSTOM_MARK_LAYOUT_RADIUS_M=(0.5*1852)/2;

function clampCustomInt(n,min,max){
  const v=Math.round(Number(n)||0);
  return Math.max(min,Math.min(max,v));
}

/** Ordered [{name,tack}]: port marks, starboard marks, then each gate (P then S). */
function customCourseMarkRowsFromRecipe(recipe){
  const r=recipe&&typeof recipe==="object"?recipe:{};
  const portN=clampCustomInt(r.portN,0,30);
  const stbdN=clampCustomInt(r.stbdN,0,30);
  const gates=clampCustomInt(r.gatePairs,0,20);
  const rows=[];
  for(let i=1;i<=portN;i++)rows.push({name:`Custom P${i}`,tack:"P"});
  for(let i=1;i<=stbdN;i++)rows.push({name:`Custom S${i}`,tack:"S"});
  for(let g=1;g<=gates;g++){
    rows.push({name:`Custom G${g}P`,tack:"P"});
    rows.push({name:`Custom G${g}S`,tack:"S"});
  }
  return rows;
}

function normalizeCustomCourseRecipe(raw){
  const o=raw&&typeof raw==="object"&&!Array.isArray(raw)?raw:{};
  const lm=String(o.lineMode||"both");
  const lineMode=lm==="start"||lm==="finish"||lm==="none"?lm:"both";
  return{
    lineMode,
    portN:clampCustomInt(o.portN,0,30),
    stbdN:clampCustomInt(o.stbdN,0,30),
    gatePairs:clampCustomInt(o.gatePairs,0,20),
    sfLapCrossingCrop:!!o.sfLapCrossingCrop,
  };
}

/** Lat/lon seed for each custom mark on a circle (bearing 0° = north, clockwise). */
function customMarkSeedPositionsFromRows(rows,cLat,cLon,radiusM=CUSTOM_MARK_LAYOUT_RADIUS_M){
  const out={};
  const n=rows.length;
  if(!n||!Number.isFinite(cLat)||!Number.isFinite(cLon)||!Number.isFinite(radiusM)||radiusM<=0)return out;
  for(let i=0;i<n;i++){
    const ang=(360/n)*i;
    const p=destinationPoint(cLat,cLon,ang,radiusM);
    out[rows[i].name]={lat:p.lat,lon:p.lon};
  }
  return out;
}

/** Ring centre for default custom-mark positions: first GPS point (recording start), else committee midpoint, else WSC default. */
function customLayoutCenterLatLon(workPoints,sfEnds){
  if(workPoints?.length){
    const p0=workPoints[0];
    if(Number.isFinite(p0?.lat)&&Number.isFinite(p0?.lon))return{lat:p0.lat,lon:p0.lon};
  }
  if(sfEnds?.endA&&sfEnds?.endB&&Number.isFinite(sfEnds.endA.lat)&&Number.isFinite(sfEnds.endB.lat))
    return{lat:(sfEnds.endA.lat+sfEnds.endB.lat)/2,lon:(sfEnds.endA.lon+sfEnds.endB.lon)/2};
  return{lat:50.842,lon:-1.305};
}

/* ═══════════════════════════════════════════════════════════════════
   FILE PARSERS
   ═══════════════════════════════════════════════════════════════════ */
function parseGPX(text){
  if(typeof DOMParser !== 'undefined'){
    const doc=new DOMParser().parseFromString(text,'text/xml');
    const pts=[];
    doc.querySelectorAll('trkpt').forEach(pt=>{
      const lat=parseFloat(pt.getAttribute('lat')),lon=parseFloat(pt.getAttribute('lon'));
      const t=pt.querySelector('time');let time=null;
      if(t)time=new Date(t.textContent).getTime()/1000;
      if(!isNaN(lat)&&!isNaN(lon))pts.push({lat,lon,time});
    });
    return pts.sort((a,b)=>(a.time||0)-(b.time||0));
  }
  const pts=[];
  const re=/<trkpt[^>]*lat=["']([^"']+)["'][^>]*lon=["']([^"']+)["'][^>]*>([\s\S]*?)<\/trkpt>/gi;
  let m;
  while((m=re.exec(text))!==null){
    const lat=parseFloat(m[1]),lon=parseFloat(m[2]);
    const tm=m[3].match(/<time[^>]*>([^<]+)<\/time>/i);
    let time=null;
    if(tm)time=new Date(tm[1]).getTime()/1000;
    if(!isNaN(lat)&&!isNaN(lon))pts.push({lat,lon,time});
  }
  return pts.sort((a,b)=>(a.time||0)-(b.time||0));
}

function parseFIT(buf){
  const view=new DataView(buf),pts=[];
  const SEMI=180/Math.pow(2,31);
  const headerSize=view.getUint8(0);
  let offset=headerSize;
  const dataSize=view.getUint32(4,true);
  const endOff=headerSize+dataSize;
  const defs={};
  try{
    while(offset<endOff-1){
      const rh=view.getUint8(offset);offset++;
      if(rh&0x80){const def=defs[rh&0x03];if(def)offset+=def.size;continue;}
      const isDef=(rh&0x40)!==0,lt=rh&0x0F;
      if(isDef){
        offset++;const arch=view.getUint8(offset);offset++;
        const gm=arch?view.getUint16(offset):view.getUint16(offset,true);offset+=2;
        const nf=view.getUint8(offset);offset++;let ts=0;const flds=[];
        for(let f=0;f<nf;f++){const fn=view.getUint8(offset);offset++;const fs=view.getUint8(offset);offset++;const bt=view.getUint8(offset);offset++;flds.push({n:fn,s:fs,b:bt});ts+=fs;}
        if(rh&0x20){const nd=view.getUint8(offset);offset++;for(let f=0;f<nd;f++){const fs2=view.getUint8(offset+1);flds.push({n:-1,s:fs2,b:0,d:true});ts+=fs2;offset+=3;}}
        defs[lt]={gm,flds,size:ts,arch};
      }else{
        const def=defs[lt];if(!def)break;
        // FIT "record" messages are global message number 20.
        if(def.gm===20){
          let lat=null,lon=null,ts=null;let fo=offset;
          for(const f of def.flds){
            if(f.d){fo+=f.s;continue;}
            try{
              if(f.n===0&&f.s===4){const v=def.arch?view.getInt32(fo):view.getInt32(fo,true);if(v!==0x7FFFFFFF)lat=v*SEMI;}
              else if(f.n===1&&f.s===4){const v=def.arch?view.getInt32(fo):view.getInt32(fo,true);if(v!==0x7FFFFFFF)lon=v*SEMI;}
              else if(f.n===253&&f.s===4){const v=def.arch?view.getUint32(fo):view.getUint32(fo,true);if(v!==0xFFFFFFFF)ts=v+631065600;}
            }catch(e){}
            fo+=f.s;
          }
          if(lat!==null&&lon!==null&&ts!==null&&Math.abs(lat)<90&&Math.abs(lon)<180)pts.push({lat,lon,time:ts});
        }
        offset+=def.size;
      }
    }
  }catch(e){console.warn("FIT parse:",e)}
  return pts;
}

function enrich(pts){
  return pts.map((p,i)=>{
    if(i===0)return{...p,sog:0,cog:0,dist:0};
    const pr=pts[i-1],dt=p.time-pr.time;
    if(dt<=0||dt>30)return{...p,sog:0,cog:0,dist:0};
    const d=hav(pr.lat,pr.lon,p.lat,p.lon),b=bear(pr.lat,pr.lon,p.lat,p.lon);
    return{...p,sog:d/dt,cog:b,dist:d,dt};
  });
}

function circularMean(angles){
  if(!angles||!angles.length)return null;
  const sinSum=angles.reduce((s,a)=>s+Math.sin(Number(a)*D),0);
  const cosSum=angles.reduce((s,a)=>s+Math.cos(Number(a)*D),0);
  return((Math.atan2(sinSum/angles.length,cosSum/angles.length)/D)+360)%360;
}

function circularMode(angles,binSize=5){
  if(!angles||!angles.length)return null;
  const bins=Math.max(1,Math.round(360/binSize));
  const counts=new Array(bins).fill(0);
  for(const a of angles){
    const idx=((Math.floor((((Number(a)%360)+360)%360)/binSize))%bins+bins)%bins;
    counts[idx]++;
  }
  let bestIdx=0,best=-1;
  for(let i=0;i<bins;i++){
    const score=counts[i]+0.5*counts[(i+1)%bins]+0.5*counts[(i-1+bins)%bins];
    if(score>best){best=score;bestIdx=i;}
  }
  return((bestIdx+0.5)*binSize)%360;
}

function circularStdDev(angles){
  if(!angles||angles.length<2)return 0;
  const sinMean=angles.reduce((s,a)=>s+Math.sin(Number(a)*D),0)/angles.length;
  const cosMean=angles.reduce((s,a)=>s+Math.cos(Number(a)*D),0)/angles.length;
  const R=Math.max(1e-6,Math.hypot(sinMean,cosMean));
  return Math.sqrt(Math.max(0,-2*Math.log(R)))/D;
}

function weightedCircularMean(items,valueKey,weightKey){
  if(!items?.length)return null;
  let sx=0,sy=0,wSum=0;
  for(const it of items){
    const a=Number(it[valueKey]);
    const w=Math.max(0.001,Number(it[weightKey]??1));
    sx+=Math.sin(a*D)*w;
    sy+=Math.cos(a*D)*w;
    wSum+=w;
  }
  if(wSum<=0)return null;
  return((Math.atan2(sx/wSum,sy/wSum)/D)+360)%360;
}

function segmentStats(pts,startIdx,endIdx){
  const segPts=pts.slice(startIdx,endIdx+1);
  const cogs=segPts.map(p=>p.cog);
  const meanCOG=circularMean(cogs);
  const meanSOG=segPts.length?segPts.reduce((s,p)=>s+ms2k(p.ss||0),0)/segPts.length:0;
  const startTime=pts[startIdx].time;
  const endTime=pts[endIdx].time;
  return{
    startIdx,endIdx,startTime,endTime,
    duration:Math.max(0,endTime-startTime),
    meanCOG:meanCOG??0,
    meanSOG,
    cogStdDev:circularStdDev(cogs),
  };
}

function detectStableSegments(pts){
  if(!pts?.length)return[];
  const stable=new Array(pts.length).fill(false);
  for(let i=0;i<pts.length;i++){
    if(i<3){stable[i]=false;continue;}
    const dt=Math.max(1e-6,pts[i].time-pts[i-3].time);
    const cogRate=Math.abs(adiff(pts[i-3].cog,pts[i].cog))/dt;
    const sogKt=ms2k(pts[i].ss||0);
    stable[i]=cogRate<4&&sogKt>1.5;
    pts[i].cogRate=cogRate;
    pts[i].isStable=stable[i];
  }
  const segments=[];
  let start=-1;
  for(let i=0;i<stable.length;i++){
    if(stable[i]&&start<0)start=i;
    if((!stable[i]||i===stable.length-1)&&start>=0){
      const end=stable[i]?i:i-1;
      const stats=segmentStats(pts,start,end);
      const minDur=start<=12?3:5;
      if(stats.duration>=minDur)segments.push(stats);
      start=-1;
    }
  }
  return segments;
}

function preReferenceFromSegment(pts,seg){
  if(!seg)return{preRefCOG:null,preRefSpeed:null,refStartIdx:null,refEndIdx:null};
  if(seg.duration<8){
    return{
      preRefCOG:seg.meanCOG,
      preRefSpeed:seg.meanSOG,
      refStartIdx:seg.startIdx,
      refEndIdx:seg.endIdx,
    };
  }
  const refEndTime=seg.endTime-5;
  let refEndIdx=seg.endIdx;
  while(refEndIdx>seg.startIdx&&pts[refEndIdx].time>refEndTime)refEndIdx--;
  const stats=segmentStats(pts,seg.startIdx,Math.max(seg.startIdx,refEndIdx));
  return{
    preRefCOG:stats.meanCOG,
    preRefSpeed:stats.meanSOG,
    refStartIdx:seg.startIdx,
    refEndIdx:Math.max(seg.startIdx,refEndIdx),
  };
}

function crossingSide(preCOG,postCOG,refDir){
  const a=((preCOG-refDir+360)%360);
  const b=((postCOG-refDir+360)%360);
  const turn=adiff(a,b);
  const steps=Math.max(8,Math.ceil(Math.abs(turn)/4));
  let minUp=360,minDn=360;
  for(let i=0;i<=steps;i++){
    const r=(a+(turn*i/steps)+360)%360;
    const dUp=Math.min(r,360-r);
    const dDn=Math.abs(r-180);
    if(dUp<minUp)minUp=dUp;
    if(dDn<minDn)minDn=dDn;
  }
  return minUp<=minDn?"upwind":"downwind";
}

function classifyCrossingFromPoints(pts,m,windDir){
  if(!pts?.length||!m?.preSegment||!m?.postSegment){
    return{kind:"none",turnIdx:m?.idx??0,crossing:null,sideBef:m?.sideBef??null,sideAft:m?.sideAft??null};
  }
  const relax=!!m._early;
  const padPre=relax?12:5,padPost=relax?14:6;
  const s=Math.max(0,m.preSegment.endIdx-padPre);
  const e=Math.min(pts.length-1,m.postSegment.startIdx+padPost);
  let bestUp={d:Infinity,idx:m.idx??s},bestDn={d:Infinity,idx:m.idx??s};
  let prevRel=null,crossIdxUp=null,crossIdxDn=null;
  for(let i=s;i<=e;i++){
    const rel=((pts[i].cog-windDir+360)%360);
    const dUp=Math.min(rel,360-rel);
    const dDn=Math.abs(rel-180);
    if(dUp<bestUp.d)bestUp={d:dUp,idx:i};
    if(dDn<bestDn.d)bestDn={d:dDn,idx:i};
    if(prevRel!=null){
      const upCross=Math.sign(adiff(0,prevRel))!==Math.sign(adiff(0,rel));
      const dnCross=Math.sign(adiff(180,prevRel))!==Math.sign(adiff(180,rel));
      if(crossIdxUp==null&&upCross)crossIdxUp=i;
      if(crossIdxDn==null&&dnCross)crossIdxDn=i;
    }
    prevRel=rel;
  }
  const upTh=relax?48:35,dnTh=relax?52:35;
  const upOK=bestUp.d<=upTh||crossIdxUp!=null;
  const dnOK=bestDn.d<=dnTh||crossIdxDn!=null;
  let kind="none",turnIdx=m.idx??s;
  if(upOK&&(!dnOK||bestUp.d<=bestDn.d+4)){
    kind="tack";
    turnIdx=crossIdxUp??bestUp.idx;
  }else if(dnOK){
    kind="gybe";
    turnIdx=crossIdxDn??bestDn.idx;
  }
  const preRel=((m.preRefCOG??m.preCOG)-windDir+360)%360;
  const postRel=((m.postCOG)-windDir+360)%360;
  const sideBef=preRel>180?"S":"P";
  const sideAft=postRel>180?"S":"P";
  const crossing=sideBef==="P"&&sideAft==="S"?"P→S":sideBef==="S"&&sideAft==="P"?"S→P":"—";
  if(kind==="none"&&relax&&crossing!=="—"&&Math.abs(adiff(m.preCOG,m.postCOG))>=38){
    kind="tack";
    turnIdx=crossIdxUp??crossIdxDn??m.idx??s;
  }
  return{kind,turnIdx,crossing,sideBef,sideAft};
}

function detectMans(pts){
  const stableSegments=detectStableSegments(pts);
  const manoeuvres=[];
  for(let i=0;i<stableSegments.length-1;i++){
    const segBefore=stableSegments[i],segAfter=stableSegments[i+1];
    const cogChange=Math.abs(adiff(segBefore.meanCOG,segAfter.meanCOG));
    if(cogChange<=50)continue;
    const midIdx=Math.max(segBefore.endIdx,Math.min(segAfter.startIdx,Math.round((segBefore.endIdx+segAfter.startIdx)/2)));
    const preRef=preReferenceFromSegment(pts,segBefore);
    manoeuvres.push({
      type:"unknown",
      idx:midIdx,
      time:pts[midIdx].time,
      preCOG:segBefore.meanCOG,
      postCOG:segAfter.meanCOG,
      cogB:segBefore.meanCOG,
      cogA:segAfter.meanCOG,
      ch:cogChange,
      cogChange,
      preSpeed:segBefore.meanSOG,
      preSegment:segBefore,
      postSegment:segAfter,
      gapDuration:Math.max(0,segAfter.startTime-segBefore.endTime),
      ...preRef,
    });
  }
  return{stableSegments,manoeuvres};
}

/** Supplement stable-segment detection in the first ~3 min where segments are still forming (e.g. river start). */
function detectEarlyMicroManoeuvres(pts){
  const out=[];
  const t0=pts[0].time;
  const maxT=t0+200;
  let lastT=-1e9;
  for(let mid=5;mid<pts.length&&pts[mid].time<=maxT;mid++){
    if(pts[mid].time-lastT<5.5)continue;
    const preFrom=Math.max(0,mid-10),preTo=mid-1;
    const postFrom=mid,postTo=Math.min(pts.length-1,mid+10);
    if(preTo<=preFrom||postTo<=postFrom)continue;
    const segBefore=segmentStats(pts,preFrom,preTo);
    const segAfter=segmentStats(pts,postFrom,postTo);
    if(segBefore.duration<0.22||segAfter.duration<0.22)continue;
    const cogChange=Math.abs(adiff(segBefore.meanCOG,segAfter.meanCOG));
    if(cogChange<32)continue;
    const preRef=preReferenceFromSegment(pts,segBefore);
    out.push({
      type:"unknown",
      idx:mid,
      time:pts[mid].time,
      preCOG:segBefore.meanCOG,
      postCOG:segAfter.meanCOG,
      cogB:segBefore.meanCOG,
      cogA:segAfter.meanCOG,
      ch:cogChange,
      cogChange,
      preSpeed:segBefore.meanSOG,
      preSegment:segBefore,
      postSegment:segAfter,
      gapDuration:Math.max(0,pts[postFrom].time-pts[preTo].time),
      ...preRef,
      _early:true,
    });
    lastT=pts[mid].time;
  }
  return out;
}

function mergeManoeuvresByTime(segMans,early){
  const merged=[...segMans];
  for(const e of early){
    const gap=e._early?6:14;
    if(merged.some(m=>Math.abs(m.time-e.time)<gap))continue;
    merged.push(e);
  }
  return merged.sort((a,b)=>a.time-b.time);
}

function applyDetectionSettings(manoeuvres,pts,det){
  if(!Array.isArray(manoeuvres)||!manoeuvres.length)return[];
  const out=[];
  const lastByType={tack:-Infinity,gybe:-Infinity};
  for(const m of manoeuvres){
    if(m.type!=="tack"&&m.type!=="gybe")continue;
    const cfg=det[m.type];
    if(!cfg)continue;
    const idx=Math.max(0,Math.min((pts?.length||1)-1,m.turnIdx??m.idx??0));
    const bPts=Math.max(1,parseInt(cfg.beforePts??4,10));
    const aPts=Math.max(1,parseInt(cfg.afterPts??5,10));
    const bIdx=Math.max(0,idx-bPts),aIdx=Math.min((pts?.length||1)-1,idx+aPts);
    const turnRef=(pts?.[bIdx]&&pts?.[aIdx])?Math.abs(adiff(pts[bIdx].cog,pts[aIdx].cog)):Math.abs(Number(m.ch)||0);
    const turn=turnRef;
    if(turn<cfg.minTurn||turn>cfg.maxTurn)continue;
    const speed=ms2k(pts?.[idx]?.ss ?? m.preRefSpeed ?? m.preSpeed ?? 0);
    if(speed<cfg.minSpeed)continue;
    const t=Number(m.time ?? pts?.[idx]?.time ?? 0);
    if(!Number.isFinite(t))continue;
    if(t-lastByType[m.type]<cfg.cooldownSec)continue;
    out.push({...m,ch:turn,cogB:pts?.[bIdx]?.cog??m.cogB,cogA:pts?.[aIdx]?.cog??m.cogA});
    lastByType[m.type]=t;
  }
  return out;
}

function initialWindFromStableSegments(stableSegments,pts=null,windTuning=null){
  const bins=new Array(36).fill(0);
  const wm=windTuning?.windward;
  for(const seg of stableSegments||[]){
    let w=Math.max(1,seg.duration);
    if(wm&&pts?.length&&Number.isFinite(wm.lat)&&Number.isFinite(wm.lon)){
      const mid=Math.floor((seg.startIdx+seg.endIdx)/2);
      const p=pts[mid];
      if(p&&Number.isFinite(p.lat)&&Number.isFinite(p.lon)){
        const bToM=bear(p.lat,p.lon,wm.lat,wm.lon);
        if(Math.abs(adiff(bToM,seg.meanCOG))<=48)w*=6.5;
      }
    }
    const idx=Math.floor((seg.meanCOG%360)/10)%36;
    bins[idx]+=w;
  }
  const peaks=bins.map((v,i)=>({a:i*10+5,w:v})).sort((a,b)=>b.w-a.w).slice(0,2);
  if(peaks.length<2)return{dir:0,conf:0};
  const h1=peaks[0].a,h2=peaks[1].a;
  const shortBis=(h1+adiff(h1,h2)/2+360)%360;
  return{dir:Math.round(shortBis)%360,conf:Math.min(0.9,(peaks[0].w+peaks[1].w)/(stableSegments.length*12||1))};
}

/** Bearings to mark (°) and weights from stable segments that head roughly toward a windward mark. */
function collectBearingToWindwardMark(pts,stableSegments,wm){
  if(!wm||!pts?.length||!stableSegments?.length||!Number.isFinite(wm.lat)||!Number.isFinite(wm.lon))return{angles:[],weights:[]};
  const angles=[],weights=[];
  for(const seg of stableSegments){
    const mid=Math.floor((seg.startIdx+seg.endIdx)/2);
    const p=pts[mid];
    if(!p||!Number.isFinite(p.lat)||!Number.isFinite(p.lon))continue;
    const bToM=bear(p.lat,p.lon,wm.lat,wm.lon);
    if(Math.abs(adiff(bToM,seg.meanCOG))>50)continue;
    const w=Math.max(1,seg.duration);
    angles.push(bToM);
    weights.push(w);
  }
  return{angles,weights};
}

function circularWeightedMeanDeg(angles,weights){
  if(!angles?.length||!weights?.length||angles.length!==weights.length)return null;
  let s=0,c=0,wSum=0;
  for(let i=0;i<angles.length;i++){
    const w=Math.max(0,Number(weights[i])||0);
    if(w<=0)continue;
    const a=((Number(angles[i])%360)+360)%360;
    s+=Math.sin(a*D)*w;
    c+=Math.cos(a*D)*w;
    wSum+=w;
  }
  if(wSum<=0)return null;
  return((Math.atan2(s/wSum,c/wSum)/D+360)%360);
}

/**
 * For automatic wind: pick wind FROM (met °) that (1) matches a windward mark when present, (2) makes
 * port vs starboard upwind TWA (acute to wind) similar (≤5° target), and (3) keeps mean TWA in ~30–50°.
 * Uses only stable straight-line segments; windward segments get extra weight.
 */
function refineWindFromUpwindTwaAndMark(stableSegments,pts,windTuning,seedWind){
  if(!stableSegments||stableSegments.length<4||!pts?.length)return seedWind;
  /** Acute angle COG↔wind FROM (same as acuteTwaFromWindDeg) — local to avoid load order issues. */
  function acuteTwaToWind(cog,wdF){
    const r=((Number(cog)-wdF+360)%360);
    return r>180?360-r:r;
  }
  const wm=windTuning?.windward;
  const toMark=wm?collectBearingToWindwardMark(pts,stableSegments,wm):{angles:[],weights:[]};
  const wMarkBearing=toMark.angles.length>=4?circularWeightedMeanDeg(toMark.angles,toMark.weights):null;

  function segmentTowardMarkWeight(seg){
    if(!wm||!Number.isFinite(wm.lat)||!Number.isFinite(wm.lon))return 1;
    const mid=Math.floor((seg.startIdx+seg.endIdx)/2);
    const p=pts[mid];
    if(!p)return 1;
    const bToM=bear(p.lat,p.lon,wm.lat,wm.lon);
    if(Math.abs(adiff(bToM,seg.meanCOG))<=48)return 3.2;
    return 1;
  }

  function buildPortStbdTwa(trialW,twaLo,twaHi){
    const portW=[],stbdW=[],portTw=[],stbdTw=[];
    for(const seg of stableSegments){
      const cog=seg.meanCOG;
      const baseW=Math.max(1,seg.duration)*segmentTowardMarkWeight(seg);
      const twa=acuteTwaToWind(cog,trialW);
      if(twa<twaLo||twa>twaHi)continue;
      const r=((cog-trialW+360)%360);
      if(r>180){
        stbdW.push(baseW);
        stbdTw.push(twa);
      }else{
        portW.push(baseW);
        portTw.push(twa);
      }
    }
    return{portW,portTw,stbdW,stbdTw};
  }

  function weightedScalarMean(values,weights){
    if(!values.length||!weights.length)return null;
    let s=0,w=0;
    for(let i=0;i<values.length;i++){
      const wi=Number(weights[i])||0;
      if(wi<=0)continue;
      s+=values[i]*wi;
      w+=wi;
    }
    return w>0?s/w:null;
  }

  function scoreTrial(trialW){
    const strict=buildPortStbdTwa(trialW,24,56);
    let portW=strict.portW,portTw=strict.portTw,stbdW=strict.stbdW,stbdTw=strict.stbdTw;
    if(portTw.length<2||stbdTw.length<2){
      const rel=buildPortStbdTwa(trialW,17,70);
      portW=rel.portW;portTw=rel.portTw;stbdW=rel.stbdW;stbdTw=rel.stbdTw;
    }
    const mP=weightedScalarMean(portTw,portW);
    const mS=weightedScalarMean(stbdTw,stbdW);
    let sym=0;
    if(mP!=null&&mS!=null)sym=Math.abs(mP-mS);
    const bandA=(m)=>{
      if(m==null||!Number.isFinite(m))return 0;
      if(m<30)return(30-m)*1.1;
      if(m>50)return(m-50)*1.1;
      return 0;
    };
    const band=bandA(mP)+bandA(mS);
    const markT=wMarkBearing!=null&&wm?0.55*Math.min(180,Math.abs(adiff(trialW,wMarkBearing))):0;
    const seedT=0.2*Math.min(180,Math.abs(adiff(trialW,seedWind)));
    return sym*6+band*2+markT+seedT;
  }

  let best=seedWind,bestS=1e9;
  for(let step=0;step<360;step++){
    const w=((step%360)+360)%360;
    const s=scoreTrial(w);
    if(s<bestS){
      bestS=s;best=w;
    }
  }
  if(wMarkBearing!=null&&wm){
    const sMark=scoreTrial(wMarkBearing);
    if(sMark<bestS){
      bestS=sMark;
      best=wMarkBearing;
    }
  }
  return((best%360)+360)%360;
}

function classifySides(manoeuvres,seedWind){
  for(const m of manoeuvres){
    const rel=((m.preRefCOG??m.preCOG)-seedWind+360)%360;
    m.sideBef=rel>180?"S":"P";
  }
  const stbd=manoeuvres.filter(m=>m.sideBef==="S").map(m=>m.preRefCOG??m.preCOG).filter(Number.isFinite);
  const port=manoeuvres.filter(m=>m.sideBef==="P").map(m=>m.preRefCOG??m.preCOG).filter(Number.isFinite);
  return{
    meanStarboardCOG:circularMean(stbd),
    meanPortCOG:circularMean(port),
  };
}

function deriveWindAndClassify(manoeuvres,stableSegments,userWind,pts=null,windTuning=null){
  const seed=userWind!=null?{dir:Number(userWind)%360,conf:1}:initialWindFromStableSegments(stableSegments,pts,windTuning);
  const allAngles=manoeuvres.map(m=>m.cogChange).sort((a,b)=>a-b);
  const med=allAngles.length?allAngles[Math.floor(allAngles.length/2)]:90;
  const hi=manoeuvres.filter(m=>Math.abs(m.cogChange-med)<=15);
  const pool=hi.length>=3?hi:manoeuvres;
  let sideMeans=classifySides(pool,seed.dir);
  let meanStarboardCOG=sideMeans.meanStarboardCOG??circularMean(stableSegments.map(s=>s.meanCOG));
  let meanPortCOG=sideMeans.meanPortCOG??((meanStarboardCOG+90)%360);
  const cand1=(meanStarboardCOG+adiff(meanStarboardCOG,meanPortCOG)/2+360)%360;
  const cand2=(cand1+180)%360;
  const wm=windTuning?.windward;
  const crossCounts=[cand1,cand2].map(c=>{
    let acc=0;
    for(const m of manoeuvres){
      let wgt=1;
      if(wm&&pts?.length){
        const ti=Math.max(0,Math.min(pts.length-1,m.turnIdx??m.idx??0));
        const p=pts[ti];
        if(p){
          const bToM=bear(p.lat,p.lon,wm.lat,wm.lon);
          const pre=m.preRefCOG??m.preCOG;
          if(Number.isFinite(pre)&&Math.abs(adiff(bToM,pre))<=50)wgt=2.4;
        }
      }
      acc+=wgt*(crossingSide(m.preCOG,m.postCOG,c)==="upwind"?1:0);
    }
    return acc;
  });
  let windDir=(userWind!=null?Number(userWind)%360:(crossCounts[0]>=crossCounts[1]?cand1:cand2));
  if(userWind==null)windDir=refineWindFromUpwindTwaAndMark(stableSegments,pts,windTuning,windDir);
  sideMeans=classifySides(pool,windDir);
  if(sideMeans.meanStarboardCOG!=null)meanStarboardCOG=sideMeans.meanStarboardCOG;
  if(sideMeans.meanPortCOG!=null)meanPortCOG=sideMeans.meanPortCOG;
  const tackAngle=Math.abs(adiff(meanStarboardCOG,meanPortCOG));
  for(const m of manoeuvres){
    const crossing=classifyCrossingFromPoints(pts,m,windDir);
    m.type=crossing.kind;
    m.windAtMan=windDir;
    m.crossing=crossing.crossing;
    m.sideBef=crossing.sideBef;
    m.sideAft=crossing.sideAft;
    m.turnIdx=crossing.turnIdx;
    if(pts?.[crossing.turnIdx]){
      m.time=pts[crossing.turnIdx].time;
      m.lat=pts[crossing.turnIdx].lat;
      m.lon=pts[crossing.turnIdx].lon;
    }
  }
  const conf=Math.min(0.98,Math.max(0.25,pool.length/Math.max(3,manoeuvres.length)));
  return{
    windDir,
    windEst:{dir:Math.round(windDir),conf},
    tackAngle,
    meanStarboardCOG,
    meanPortCOG,
  };
}

function buildWindTrace(stableSegments,baselines,startTime,endTime){
  const close=[];
  for(const seg of stableSegments||[]){
    const dP=Math.abs(adiff(seg.meanCOG,baselines.portCOG));
    const dS=Math.abs(adiff(seg.meanCOG,baselines.stbdCOG));
    const near=Math.min(dP,dS)<=10;
    if(!near)continue;
    const side=dP<=dS?"port":"stbd";
    const windRaw=side==="stbd"?((seg.meanCOG+baselines.tackAngle/2+360)%360):((seg.meanCOG-baselines.tackAngle/2+360)%360);
    const conf=seg.duration>10?"high":seg.duration>=5?"medium":"low";
    close.push({
      time:(seg.startTime+seg.endTime)/2,
      windDir:windRaw,
      confidence:conf,
      interpolated:false,
      std:Math.min(20,Math.max(2,seg.cogStdDev)),
      weight:Math.max(1,seg.duration),
    });
  }
  close.sort((a,b)=>a.time-b.time);
  const smoothed=close.map((pt,i)=>{
    const left=pt.time-15,right=pt.time+15;
    const window=close.filter(x=>x.time>=left&&x.time<=right);
    const windDir=weightedCircularMean(window,"windDir","weight")??pt.windDir;
    return{...pt,windDir};
  });
  if(smoothed.length===0)return{windTrace:[],windStats:{range:0,avgShiftPeriod:null,trend:"unknown"}};
  const trace=[...smoothed];
  if(smoothed[0].time>startTime+2)trace.unshift({...smoothed[0],time:startTime,interpolated:true});
  if(smoothed[smoothed.length-1].time<endTime-2)trace.push({...smoothed[smoothed.length-1],time:endTime,interpolated:true});
  for(let i=0;i<trace.length-1;i++){
    const a=trace[i],b=trace[i+1];
    if(b.time-a.time>60){
      const step=30;
      for(let t=a.time+step;t<b.time;t+=step){
        const ratio=(t-a.time)/(b.time-a.time);
        const d=adiff(a.windDir,b.windDir);
        trace.push({time:t,windDir:(a.windDir+d*ratio+360)%360,confidence:"low",interpolated:true,std:10,weight:1});
      }
    }
  }
  trace.sort((a,b)=>a.time-b.time);
  const dirs=trace.map(x=>x.windDir);
  const unwrapped=[dirs[0]];
  for(let i=1;i<dirs.length;i++){
    unwrapped[i]=unwrapped[i-1]+adiff(unwrapped[i-1],dirs[i]);
  }
  const range=(Math.max(...unwrapped)-Math.min(...unwrapped))||0;
  let turns=0,lastSign=0,lastTurnTime=null,periods=[];
  for(let i=1;i<unwrapped.length;i++){
    const delta=unwrapped[i]-unwrapped[i-1];
    const sign=Math.abs(delta)<0.4?0:(delta>0?1:-1);
    if(sign!==0&&lastSign!==0&&sign!==lastSign){
      turns++;
      if(lastTurnTime!=null)periods.push(trace[i].time-lastTurnTime);
      lastTurnTime=trace[i].time;
    }else if(sign!==0&&lastSign===0&&lastTurnTime==null){
      lastTurnTime=trace[i].time;
    }
    if(sign!==0)lastSign=sign;
  }
  const avgShiftPeriod=periods.length?periods.reduce((a,b)=>a+b,0)/periods.length:null;
  const net=unwrapped[unwrapped.length-1]-unwrapped[0];
  const trend=Math.abs(net)>=6?(net>0?"persistent veer":"persistent back"):turns>=2?"oscillating":"stable";
  return{windTrace:trace,windStats:{range,avgShiftPeriod,trend}};
}

function windAtTime(windTrace,time,fallback){
  if(!windTrace?.length)return fallback;
  if(time<=windTrace[0].time)return windTrace[0].windDir;
  for(let i=0;i<windTrace.length-1;i++){
    const a=windTrace[i],b=windTrace[i+1];
    if(time>=a.time&&time<=b.time){
      const ratio=(time-a.time)/Math.max(1e-6,b.time-a.time);
      return(a.windDir+adiff(a.windDir,b.windDir)*ratio+360)%360;
    }
  }
  return windTrace[windTrace.length-1].windDir;
}

function buildBaselines(stableSegments,meanPortCOG,meanStarboardCOG,tackAngle,windDir){
  const portSegs=stableSegments.filter(s=>Math.abs(adiff(s.meanCOG,meanPortCOG))<=10);
  const stbdSegs=stableSegments.filter(s=>Math.abs(adiff(s.meanCOG,meanStarboardCOG))<=10);
  const weightedMeanSpeed=arr=>{
    const w=arr.reduce((s,x)=>s+x.duration,0)||1;
    return arr.reduce((s,x)=>s+x.meanSOG*x.duration,0)/w;
  };
  const portSpeed=weightedMeanSpeed(portSegs);
  const stbdSpeed=weightedMeanSpeed(stbdSegs);
  const allUp=[...portSegs,...stbdSegs];
  const upwindVMG=allUp.length?allUp.reduce((s,seg)=>{
    const rel=Math.abs(adiff(seg.meanCOG,windDir));
    return s+seg.meanSOG*Math.cos(rel*D)*seg.duration;
  },0)/(allUp.reduce((s,seg)=>s+seg.duration,0)||1):0;
  return{
    portCOG:meanPortCOG,
    portSpeed,
    stbdCOG:meanStarboardCOG,
    stbdSpeed,
    tackAngle,
    upwindVMG:Math.abs(upwindVMG),
  };
}

function tackTarget(sideAft,baselines){
  const isPort=sideAft==="P";
  return{
    targetCOG:isPort?baselines.portCOG:baselines.stbdCOG,
    targetSpeed:isPort?baselines.portSpeed:baselines.stbdSpeed,
  };
}

function secondsIndexFrom(pts,startIdx,seconds){
  const target=pts[startIdx].time+seconds;
  let i=startIdx;
  while(i<pts.length&&pts[i].time<target)i++;
  return Math.min(pts.length-1,i);
}

function speedProfile(pts,idx){
  const s=Math.max(0,idx-10),e=Math.min(pts.length-1,idx+25);
  const out=[];
  for(let i=s;i<=e;i++)out.push({t:Math.round(pts[i].time-pts[idx].time),speed:parseFloat(ms2k(pts[i].ss||0).toFixed(2))});
  return out;
}

/** Tack manoeuvre heuristics (speed recovery profile, heading metrics, VMG-cost integral). **% quality** is set later by `applyTackVmgQualityVsUpwindRef`. Scoring window starts no earlier than T−10s before COG–wind crossing. */
function scoreTackManoeuvre(m,pts,baselines,windTrace,windDir){
  const turnIdx=Math.max(0,Math.min(pts.length-1,m.turnIdx??m.idx??0));
  const tCross=pts[turnIdx]?.time;
  let startIdx=Math.max(0,Math.min(pts.length-1,m.idx??turnIdx));
  if(Number.isFinite(tCross)){
    const initNotBefore=tCross-MANEUVER_INIT_WINDOW_BEFORE_CROSS_SEC;
    if(pts[startIdx]?.time<initNotBefore)startIdx=nearestTimeIndexInSortedGps(pts,initNotBefore);
  }
  const profileCentre=Math.max(0,Math.min(pts.length-1,m.turnIdx??m.idx??startIdx));
  const endSearch=Math.min(pts.length-1,secondsIndexFrom(pts,startIdx,30));
  const target=tackTarget(m.sideAft||m.sideBef,baselines);
  const speedThreshold=(target.targetSpeed||0)*0.9;
  let speedRecovery=30;
  for(let i=startIdx;i<=endSearch;i++){
    if(ms2k(pts[i].ss||0)>=speedThreshold){speedRecovery=Math.round(Math.max(0,pts[i].time-pts[startIdx].time));break;}
  }
  let headingConvergence=30;
  for(let i=startIdx;i<=endSearch;i++){
    const ok=Math.abs(adiff(pts[i].cog,target.targetCOG))<=5&&i+2<=endSearch&&Math.abs(adiff(pts[i+1].cog,target.targetCOG))<=5&&Math.abs(adiff(pts[i+2].cog,target.targetCOG))<=5;
    if(ok){headingConvergence=Math.round(Math.max(0,pts[i].time-pts[startIdx].time));break;}
  }
  const sampleEnd=Math.min(pts.length-1,secondsIndexFrom(pts,startIdx,speedRecovery));
  const localWind=windAtTime(windTrace,pts[startIdx].time,windDir);
  const preVmg=Math.max(0,(m.preRefSpeed??m.preSpeed??0)*Math.cos(Math.abs(adiff(m.preRefCOG??m.preCOG,localWind))*D));
  let vmgCost=0;
  for(let i=startIdx;i<=sampleEnd;i++){
    const w=windAtTime(windTrace,pts[i].time,localWind);
    const actual=ms2k(pts[i].ss||0)*Math.cos(Math.abs(adiff(pts[i].cog,w))*D);
    const deficit=Math.max(0,preVmg-actual);
    vmgCost+=deficit*0.514444*(pts[i].dt||1);
  }
  const biasSamples=pts.slice(startIdx,Math.min(pts.length,startIdx+6)).map(p=>adiff(target.targetCOG,p.cog));
  const exitBiasAmount=biasSamples.length?biasSamples.reduce((s,x)=>s+x,0)/biasSamples.length:0;
  const exitBias=Math.abs(exitBiasAmount)<=3?"neutral":exitBiasAmount<0?"high":"low";
  return{
    speedRecovery,headingConvergence,vmgCost,exitBias,exitBiasAmount,
    speedProfile:speedProfile(pts,profileCentre),windAtTack:localWind,
  };
}

/** Auto wind (meteorological ° FROM), now from stable segment geometry. */
function estWind(pts,windTuning=null){
  const{stableSegments,manoeuvres}=detectMans(pts);
  const out=deriveWindAndClassify(manoeuvres,stableSegments,null,pts,windTuning);
  return out.windEst;
}

/** Full rounding order: optional preamble (once) then lap marks × laps (matches WSC Course Selector). */
function expandCourseMarks(preamble,lapMarks,laps){
  const fullSeq=[];
  let seqIdx=0;
  const pre=preamble||[];
  const lap=lapMarks||[];
  const nLaps=Math.max(1,Number(laps)||1);
  pre.forEach(m=>{fullSeq.push({...m,lap:0,seqIdx:seqIdx++});});
  for(let lapN=0;lapN<nLaps;lapN++){
    lap.forEach(m=>{fullSeq.push({...m,lap:lapN+1,seqIdx:seqIdx++});});
  }
  return fullSeq;
}
/** Fingerprint of expanded mark order + S/F for invalidating leg/gate analysis when anything moves. */
function courseGeometrySignature(preambleWithPos,lapWithPos,nLaps,sfEnds){
  const nL=Math.max(1,Number(nLaps)||1);
  const pre=preambleWithPos&&preambleWithPos.length?preambleWithPos:[];
  const lap=lapWithPos||[];
  const seq=expandCourseMarks(pre,lap,nL);
  const sPart=seq.map(m=>([m.name,Number(m.lat).toFixed(6),Number(m.lon).toFixed(6),m.tack??"",m.lap|0].join("\t"))).join("\n");
  const sf=sfEnds?.endA&&sfEnds?.endB?`${Number(sfEnds.endA.lat).toFixed(6)},${Number(sfEnds.endA.lon).toFixed(6)},${Number(sfEnds.endB.lat).toFixed(6)},${Number(sfEnds.endB.lon).toFixed(6)}`:"";
  return `${sPart}|L${nL}|${sf}`;
}

function closestIndexToLine(pts,endA,endB,fromIdx,toIdx){
  let bestIdx=-1,bestDist=Infinity;
  const s=Math.max(0,fromIdx||0),e=Math.min(pts.length-1,toIdx==null?pts.length-1:toIdx);
  for(let i=s;i<=e;i++){
    const d=distPointToSegmentM(pts[i].lat,pts[i].lon,endA.lat,endA.lon,endB.lat,endB.lon);
    if(d<bestDist){bestDist=d;bestIdx=i;}
  }
  return{idx:bestIdx,dist:bestDist};
}
/** Mark GPS indices that fall inside detected tack/gybe windows (pre→post segment). */
function manoeuvreIndexMask(pts,tacks,gybes){
  const n=pts?.length||0;
  if(!n)return new Uint8Array(0);
  const m=new Uint8Array(n);
  const addEv=(x)=>{
    if(x?.preSegment&&x?.postSegment){
      const a=Math.max(0,x.preSegment.startIdx|0),b=Math.min(n-1,x.postSegment.endIdx|0);
      for(let k=a;k<=b;k++)m[k]=1;
    }else{
      const ti=x?.turnIdx??x?.idx??-1;
      if(ti>=0)for(let k=Math.max(0,ti-6);k<=Math.min(n-1,ti+8);k++)m[k]=1;
    }
  };
  (tacks||[]).forEach(addEv);
  (gybes||[]).forEach(addEv);
  return m;
}

/** Exclude only a short span around each turn index (not full pre→post segments) — for start-line % speed so a busy pre-start does not blank the whole 30s window. */
function manoeuvreIndexMaskNarrow(pts,tacks,gybes,halfWidth=8){
  const n=pts?.length||0;
  if(!n)return new Uint8Array(0);
  const m=new Uint8Array(n);
  const w=Math.max(1,halfWidth|0);
  const mark=(ev)=>{
    const c=ev?.turnIdx??ev?.idx??-1;
    if(c<0)return;
    for(let k=Math.max(0,c-w);k<=Math.min(n-1,c+w);k++)m[k]=1;
  };
  (tacks||[]).forEach(mark);
  (gybes||[]).forEach(mark);
  return m;
}

/**
 * Start-line summary for Overview: signed distance, time early/late (tCross − tStart),
 * % speed at gun vs mean next 30s (excl. manoeuvres).
 * `seriesAnalysis` should be full-track analysis when available: committee **crossing time** (interpolated),
 * gun refine, bow-at-gun and (when it differs from `distAnalysis`) distance-from-line all use the same point array
 * so a tight crop cannot strip pre-start samples. Time early/late = `tCross − tGun` (s), with `tCross` from
 * line crossing with **nearest** **`|time − gun|`** in-window (not raw leg-build `committeeLineCrossingIdx` — that mirrors map **`cA`**, sometimes an earlier line cross). Fallbacks below.
 * with segment index ∈ [1 … START leg end] (includes crossings before `startIdx` when START idx is closest-point).
 * `raceClockSec`: Setup race-start as seconds 0–86400 — refines unix gun time on ±120 s (see `GUN_CLOCK_REFINE_PAD_SEC`) at 0.5 s steps for bow distance & speeds.
 * **Crossing time:** Use **nearest** **`|t_cross − t_gun|`** among `detectLineCrossings` ∩ [1 … START.endIdx].
 * (`legBuild.committeeLineCrossingIdx` aligns with map-gate **`cA`**, often the first crossing of that leg window — including an early OCS/pass-through — so it is **not** used when any crossing exists in-window.)
 */
function computeStartLineDetails(distAnalysis,seriesAnalysis,sfEnds,tSignalAbs,courseLetter,effectiveMarks,gpsToBowM,raceClockSec=null,firstMarkRefName=null){
  if(!distAnalysis?.points?.length||!sfEnds?.endA||!sfEnds?.endB||!Number.isFinite(tSignalAbs))return null;
  const ser=seriesAnalysis&&seriesAnalysis.points?.length?seriesAnalysis:distAnalysis;
  const sPts=ser.points;
  const sLeg=ser.legs?.find(l=>l.from==="START");
  if(!sPts.length||!sLeg||sLeg.startIdx==null||sLeg.endIdx==null)return null;
  const dLeg=distAnalysis.legs?.find(l=>l.from==="START");
  const e0=sfEnds.endA,e1=sfEnds.endB;
  const ll=(la,lo)=>`${Number(la).toFixed(5)}, ${Number(lo).toFixed(5)}`;

  let tGun=tSignalAbs;
  let gunRefineApplied=false;
  let gunSeedIdx=-1;
  let gunRefinedValue=null;
  if(raceClockSec!=null&&Number.isFinite(raceClockSec)){
    gunSeedIdx=nearestTimeIndexInSortedGps(sPts,tSignalAbs);
    const rg=refinedUnixGunFromClockNearby(sPts,raceClockSec,gunSeedIdx);
    if(rg!=null&&Number.isFinite(rg)){tGun=rg;gunRefineApplied=true;gunRefinedValue=rg;}
  }

  const coarseFromCourse=()=>{
    const m=courseLetter&&WSC_COURSES[courseLetter]?WSC_COURSES[courseLetter].marks?.[0]:null;
    if(Array.isArray(m))return m[0];
    return typeof m==="string"?m:null;
  };
  const firstName=(typeof firstMarkRefName==="string"&&firstMarkRefName.trim()?firstMarkRefName.trim():null)||coarseFromCourse();
  const fm=firstName?effectiveMarks?.[firstName]:null;
  const si0=Math.max(0,Math.min(sPts.length-1,sLeg.startIdx|0));
  const bowM=Number(gpsToBowM)||0;
  let distM=null,distSource="";
  let antDm=null,bowDm=null;

  const signAt=(latP,lonP,label)=>{
    if(!(fm&&Number.isFinite(fm.lat)&&Number.isFinite(fm.lon)&&latP!=null&&lonP!=null))return null;
    return signedDistanceToCommitteeLineM(latP,lonP,e0,e1,fm.lat,fm.lon);
  };
  const antPt=interpolatePointByTime(sPts,tGun);
  if(antPt)antDm=signAt(antPt.lat,antPt.lon,"antenna");

  if(fm&&Number.isFinite(fm.lat)&&Number.isFinite(fm.lon)){
    const bow=gpsPositionToBowAtTime(sPts,tGun,bowM)||gpsPositionToBow(sPts,si0,bowM);
    const refLat=bow?.lat??sPts[si0]?.lat,refLon=bow?.lon??sPts[si0]?.lon;
    if(refLat!=null&&refLon!=null){
      distM=signedDistanceToCommitteeLineM(refLat,refLon,e0,e1,fm.lat,fm.lon);
      bowDm=distM;
      distSource="bow @ interpolated tGun (+ committee vs first-mark ref)";
    }
  }
  if(!Number.isFinite(distM)){
    distM=Number.isFinite(sLeg.startLineDistanceM)?sLeg.startLineDistanceM:null;
    if(Number.isFinite(distM))distSource="fallback: START leg.startLineDistanceM (map gate)";
  }
  if(!Number.isFinite(distM)&&dLeg&&Number.isFinite(dLeg.startLineDistanceM)){
    distM=dLeg.startLineDistanceM;
    distSource="fallback: distAnalysis START leg.startLineDistanceM";
  }
  if(!Number.isFinite(distM)&&fm&&Number.isFinite(fm.lat)&&Number.isFinite(fm.lon)){
    const bow=gpsPositionToBow(sPts,si0,bowM);
    const refLat=bow?.lat??sPts[si0]?.lat,refLon=bow?.lon??sPts[si0]?.lon;
    if(refLat!=null){distM=signedDistanceToCommitteeLineM(refLat,refLon,e0,e1,fm.lat,fm.lon);distSource="fallback: bow @ START leg.startIdx";}
  }

  const endSeg=Math.max(1,Math.min(sPts.length-1,sLeg.endIdx|0));
  let tCross=null,tCrossSource="",tCrossSegIdx=null,tCrossDir=null,fallbackSegJ=null;
  let tCommitteeIdxCross=null,jc=null;
  const lb=ser?.legDiagnostics&&Array.isArray(ser.legDiagnostics.legBuild)?ser.legDiagnostics.legBuild:null;
  const startRow=lb?.find?.(r=>String(r.status)==="included"&&String(r.from)==="START")??null;
  jc=startRow?.committeeLineCrossingIdx;
  if(jc!=null&&Number.isFinite(jc)){
    const jj=jc|0;
    if(jj>=1&&jj<sPts.length){
      const tIc=interpolatedCommitteeLineCrossingTime(sPts,jj,e0,e1);
      if(tIc!=null&&Number.isFinite(tIc))tCommitteeIdxCross=tIc;
    }
  }

  const allCross=detectLineCrossings(sPts,e0,e1);
  const crossFiltered=allCross.filter(c=>{
    const i=c.idx|0;
    return i>=1&&i<=endSeg&&Number.isFinite(c.time);
  }).map(c=>({idx:c.idx|0,time:c.time,direction:c.direction||"",deltaSec:c.time-tGun}));
  crossFiltered.sort((a,b)=>Math.abs(a.deltaSec)-Math.abs(b.deltaSec));

  if(crossFiltered.length){
    const best=crossFiltered[0];
    tCross=best.time;
    tCrossSource="nearest |t−tGun| among detectLineCrossings ∩ [1..START.endIdx]";
    tCrossSegIdx=best.idx;
    tCrossDir=best.direction||"";
  }else if(tCommitteeIdxCross!=null&&Number.isFinite(tCommitteeIdxCross)){
    tCross=tCommitteeIdxCross;
    tCrossSegIdx=(jc|0)||null;
    tCrossSource="fallback: legBuild.committeeLineCrossingIdx (no committee crossings detected in-window)";
  }else{
    let j=firstCommitteeLineSegmentCrossing(sPts,0,endSeg,e0,e1);
    fallbackSegJ=j;
    if(j<0&&Number.isFinite(sLeg.startIdx)&&sLeg.startIdx>1)
      j=firstCommitteeLineSegmentCrossing(sPts,Math.max(0,(sLeg.startIdx|0)-1),endSeg,e0,e1);
    fallbackSegJ=j;
    if(j>=0){
      tCross=interpolatedCommitteeLineCrossingTime(sPts,j,e0,e1);
      tCrossSource=`firstCommitteeLineSegmentCrossing fallback (seg endpoint j=${j})`;
      tCrossSegIdx=j;
    }
  }
  const timeDeltaSec=tCross!=null&&Number.isFinite(tCross)?tCross-tGun:null;

  const vGun=speedKtsAtTime(sPts,tGun);
  const mask=manoeuvreIndexMaskNarrow(sPts,ser.tacks,ser.gybes,8);
  const speeds=[];
  for(let i=0;i<sPts.length;i++){
    const t=sPts[i].time;
    if(t<=tGun)continue;
    if(t>tGun+30)break;
    if(mask[i])continue;
    const s=ms2k(sPts[i].ss||0);
    if(s>0.05)speeds.push(s);
  }
  let speedPct=null;
  if(speeds.length&&vGun!=null&&Number.isFinite(vGun)){
    const avg=speeds.reduce((a,b)=>a+b,0)/speeds.length;
    if(avg>0.05)speedPct=100*vGun/avg;
  }

  const badges={
    hasLine:true,
    distM:Number.isFinite(distM)?distM:null,
    timeDeltaSec:timeDeltaSec!=null&&Number.isFinite(timeDeltaSec)?timeDeltaSec:null,
    speedPct:Number.isFinite(speedPct)?speedPct:null,
  };
  const allCrossPreview=allCross.slice(0,35).map(c=>({idx:c.idx|0,time:c.time,tRelGun:Math.round((c.time-tGun)*10)/10,dir:c.direction}));
  const diag={
    seriesPoints:sPts.length,
    cropSeriesPoints:(distAnalysis.points||[]).length,
    samePointArrayAsCrop:distAnalysis.points===ser.points,
    committeeEndA:ll(e0.lat,e0.lon),
    committeeEndB:ll(e1.lat,e1.lon),
    tNearestClockToRaceStart_unix:tSignalAbs,
    raceClockSec:raceClockSec!=null&&Number.isFinite(raceClockSec)?raceClockSec:null,
    gun_unix:tGun,
    gunRefinement:{
      padSec:GUN_CLOCK_REFINE_PAD_SEC,
      stepSec:LINE_CROSS_REFINE_STEP_SEC,
      seedNearestTrackIdx:gunSeedIdx>=0?gunSeedIdx:null,
      applied:gunRefineApplied,
      unixIfApplied:gunRefinedValue,
    },
    STARTLeg:{startIdx:sLeg.startIdx,endIdx:sLeg.endIdx,endSeg,to:String(sLeg.to||""),startLineDistanceM:sLeg.startLineDistanceM},
    legBuildSTART:gatingRowJSON(startRow),
    tCross_unix:tCross,
    tCross_fromCommitteeLineCrossingIdx_unix:tCommitteeIdxCross,
    tCrossSource,
    tCrossSegIdx,
    tCrossDir,
    timeDeltaSec,
    firstMarkRef:firstName||null,
    firstMarkLatLon:fm&&Number.isFinite(fm.lat)?ll(fm.lat,fm.lon):null,
    bowOffsetM:bowM,
    signedDistM_bowUsedForBadge:Number.isFinite(distM)?distM:null,
    signedDistM_antennaAtGun:antDm,
    signedDistM_bowAtGunIfComputed:bowDm,
    distSource,
    crossingCandidatesWindow:crossFiltered.slice(0,12),
    crossingAllTrackFirst35:allCrossPreview,
    fallbackSegmentJ:fallbackSegJ,
    note:"Signed distance = committee line vs first-mark side (same as Overview). Time = chosen crossing − tGun; chosen = nearest |Δt| among in-window crossings (not raw leg-build index, which is map-gate cA). Early means tCross < tGun.",
  };
  return{badges,diagnostics:diag};
}
function gatingRowJSON(row){
  if(!row)return null;
  try{
    const o={
      status:row.status,
      stepIndex:row.stepIndex,
      from:row.from,
      to:row.to,
      startIdx:row.startIdx,
      endIdx:row.endIdx,
      committeeLineCrossingIdx:row.committeeLineCrossingIdx,
      gateDebug:row.gateDebug,
    };
    const s=JSON.stringify(o);
    return s.length>2500?s.slice(0,2500)+"\u2026":s;
  }catch(_){ return"{}";}
}
function computeStartLineOverviewBadges(distAnalysis,seriesAnalysis,sfEnds,tSignalAbs,courseLetter,effectiveMarks,gpsToBowM,raceClockSec=null,firstMarkRefName=null){
  const r=computeStartLineDetails(distAnalysis,seriesAnalysis,sfEnds,tSignalAbs,courseLetter,effectiveMarks,gpsToBowM,raceClockSec,firstMarkRefName);
  return r?r.badges:null;
}

/** Metres — expand “rounding zone” around closest approach for turn geometry. */
const MARK_ROUND_ZONE_M=10;
/** Seconds — total time window centered on closest approach (± half each side). */
const MARK_ROUND_MAX_SPAN_SEC=5;
/** If further than this from mark and COG ≈ port/stbd baseline → normal track (not orange rounding). */
const MARK_ROUND_NORMAL_MIN_DIST_M=5;
const MARK_ROUND_SAILING_COG_TOL_DEG=10;
/** Closest point on manoeuvre window (GPS samples) within this distance (m) of any course mark → mark manoeuvre (excluded from stats & leg VMG mode). */
const MARK_MANOEUVRE_AT_MARK_M=10;
/** Tack/gybe turn centre within this many GPS indices of a detected mark-rounding hit → excluded from racing stats (orange badge). */
const MARK_MANOEUVRE_NEAR_ROUNDING_PTS=4;
function allCourseMarkLocations(markPositions,preamble,laps){
  const seq=expandCourseMarks(preamble,markPositions||[],Math.max(1,Number(laps)||1));
  const by=new Map();
  for(const x of seq){
    if(x?.name&&x.lat!=null&&x.lon!=null)by.set(x.name,{name:x.name,lat:x.lat,lon:x.lon});
  }
  return[...by.values()];
}
function nearestCourseMarkM(lat,lon,locList){
  if(lat==null||lon==null||!locList?.length)return{dist:Infinity,name:null};
  let best=Infinity,bestN=null;
  for(const x of locList){
    const d=hav(lat,lon,x.lat,x.lon);
    if(d<best){best=d;bestN=x.name;}
  }
  return{dist:best,name:bestN};
}

/** Minimum distance from any GPS sample in the manoeuvre detection window to the nearest course mark. */
function minDistManoeuvreWindowToCourseMarksM(pts,m,det,locList){
  if(!pts?.length||!locList?.length||!m?.type||!det?.[m.type]){
    const idx=Math.max(0,Math.min((pts?.length||1)-1,m?.turnIdx??m?.idx??0));
    const p=pts?.[idx];
    return p?nearestCourseMarkM(p.lat,p.lon,locList):{dist:Infinity,name:null};
  }
  const cfg=det[m.type];
  const idx=Math.max(0,Math.min(pts.length-1,m.turnIdx??m.idx??0));
  const bPts=Math.max(1,parseInt(cfg.beforePts??4,10));
  const aPts=Math.max(1,parseInt(cfg.afterPts??5,10));
  const bIdx=Math.max(0,idx-bPts),aIdx=Math.min(pts.length-1,idx+aPts);
  let bestD=Infinity,bestN=null;
  for(let i=bIdx;i<=aIdx;i++){
    const pt=pts[i];
    if(!pt)continue;
    const nm=nearestCourseMarkM(pt.lat,pt.lon,locList);
    if(nm.dist<bestD){bestD=nm.dist;bestN=nm.name;}
  }
  return{dist:bestD,name:bestN};
}
function isNearBaselineCOG(cog,portCOG,stbdCOG,tolDeg){
  if(!Number.isFinite(cog)||!Number.isFinite(portCOG)||!Number.isFinite(stbdCOG)||!Number.isFinite(tolDeg))return false;
  return Math.abs(adiff(cog,portCOG))<=tolDeg||Math.abs(adiff(cog,stbdCOG))<=tolDeg;
}

/** Multi-part LineString for map: kind "rounding" (orange) vs "normal" (teal). Segments share a vertex at colour boundaries so no edges are missing. */
function buildTrackSegmentFeatureCollection(pts,mask){
  if(!pts||pts.length<2)return{type:"FeatureCollection",features:[]};
  const n=pts.length;
  const m=mask&&mask.length===n?mask:new Array(n).fill(false);
  const feats=[];
  let segStart=0;
  let kind=m[0]?"rounding":"normal";
  const pushSeg=(a,b,k)=>{
    if(b<a)return;
    const coords=[];
    for(let j=a;j<=b;j++)coords.push([pts[j].lon,pts[j].lat]);
    if(coords.length===1)coords.push(coords[0]);
    if(coords.length>=2)feats.push({type:"Feature",properties:{kind:k},geometry:{type:"LineString",coordinates:coords}});
  };
  for(let i=1;i<n;i++){
    const rk=m[i]?"rounding":"normal";
    if(rk!==kind){
      pushSeg(segStart,i-1,kind);
      segStart=i-1;
      kind=rk;
    }
  }
  pushSeg(segStart,n-1,kind);
  if(!feats.length){
    return{type:"FeatureCollection",features:[{type:"Feature",properties:{kind:"normal"},geometry:{type:"LineString",coordinates:pts.map(p=>[p.lon,p.lat])}}]};
  }
  return{type:"FeatureCollection",features:feats};
}
/**
 * Track segments by leg attempt (leg0, leg1, …, leg_skip_k) with rounding zones still orange.
 * `legBuildLog` rows must have startIdx, endIdx, status, stepIndex (from buildLegsFromRoundingsArray).
 */
function buildTrackSegmentFeatureCollectionWithLegDiagnostics(pts,legBuildLog,roundingMask){
  if(!pts||pts.length<2)return{type:"FeatureCollection",features:[]};
  const n=pts.length;
  const mask=roundingMask&&roundingMask.length===n?roundingMask:new Array(n).fill(false);
  const kinds=new Array(n).fill("base");
  if(Array.isArray(legBuildLog)){
    legBuildLog.forEach(row=>{
      const a=row.startIdx|0,b=row.endIdx|0,si=row.stepIndex|0;
      if(a<0||b>=n||a>b||!Number.isFinite(a)||!Number.isFinite(b))return;
      const ok=row.status==="included"||row.status==="ok";
      const tag=ok?`leg${si}`:`leg_skip_${si}`;
      for(let i=a;i<=b;i++)kinds[i]=tag;
    });
  }
  for(let i=0;i<n;i++)if(mask[i])kinds[i]="rounding";
  const feats=[];
  let segStart=0;
  let kind=kinds[0]||"base";
  const pushSeg=(a,b,k)=>{
    if(b<a)return;
    const coords=[];
    for(let j=a;j<=b;j++)coords.push([pts[j].lon,pts[j].lat]);
    if(coords.length===1)coords.push(coords[0]);
    if(coords.length>=2)feats.push({type:"Feature",properties:{kind:k},geometry:{type:"LineString",coordinates:coords}});
  };
  for(let i=1;i<n;i++){
    const rk=kinds[i]||"base";
    if(rk!==kind){
      pushSeg(segStart,i-1,kind);
      segStart=i-1;
      kind=rk;
    }
  }
  pushSeg(segStart,n-1,kind);
  if(!feats.length){
    return{type:"FeatureCollection",features:[{type:"Feature",properties:{kind:"base"},geometry:{type:"LineString",coordinates:pts.map(p=>[p.lon,p.lat])}}]};
  }
  return{type:"FeatureCollection",features:feats};
}
/** Mapbox GL `line-color` expression: rounding (orange), leg0…15, leg_skip_0…15 (grey), base (teal). */
function mapboxTrackLineColorByKindExpr(defaultTrkColor,roundingColor){
  const pairs=["rounding",roundingColor,"base",defaultTrkColor,"normal",defaultTrkColor];
  for(let i=0;i<16;i++){
    pairs.push(`leg${i}`,TRACK_LEG_SEGMENT_PALETTE[i%TRACK_LEG_SEGMENT_PALETTE.length]);
    pairs.push(`leg_skip_${i}`,TRACK_LEG_SKIP_COLOR);
  }
  pairs.push(defaultTrkColor);
  return["match",["get","kind"],...pairs];
}

function computeRoundingPointMask(pts,details,baselines){
  const n=pts?.length||0;
  const mask=new Array(n).fill(false);
  if(!n||!details?.length)return mask;
  const pCOG=baselines?.portCOG,sCOG=baselines?.stbdCOG;
  const tol=MARK_ROUND_SAILING_COG_TOL_DEG,exclM=MARK_ROUND_NORMAL_MIN_DIST_M;
  for(const d of details){
    if(d.skipped||d.zoneStartIdx==null||d.markLat==null||d.markLon==null)continue;
    const mlat=d.markLat,mlon=d.markLon;
    const z0=d.zoneStartIdx,z1=d.zoneEndIdx;
    for(let i=z0;i<=z1&&i<n;i++){
      const pt=pts[i];
      const dist=hav(pt.lat,pt.lon,mlat,mlon);
      if(dist>exclM&&isNearBaselineCOG(pt.cog,pCOG,sCOG,tol))continue;
      mask[i]=true;
    }
  }
  return mask;
}

/**
 * Turn resolved `roundings` (with optional START/FINISH) into legs + one diagnostic row per consecutive pair.
 */
function buildLegsFromRoundingsArray(pts,roundings,sfMid,startFinishLine,gpsToBowM,windFromDeg,windwardMarkName){
  const legs=[];
  const legBuildLog=[];
  const getWP=(r)=>{
    if(r.lat!=null&&r.lon!=null&&Number.isFinite(r.lat)&&Number.isFinite(r.lon))return{lat:r.lat,lon:r.lon};
    const p=pts?.[r.idx];
    return p?{lat:p.lat,lon:p.lon}:null;
  };
  let nextFrom=0;
  for(let i=0;i<roundings.length-1;i++){
    const r0=roundings[i],r1=roundings[i+1];
    const wA0=getWP(r0),wB0=getWP(r1);
    const wA=String(r0.mark)==="START"&&sfMid?sfMid:(wA0||null);
    const wB=String(r1.mark)==="FINISH"&&sfMid?sfMid:(wB0||null);
    const si=r0.idx,ei=r1.idx;
    let startIdx=si,endIdx=ei,roundingM=0,roundingStraightM=null,legPathDef="closest",roundingKind=null;
    let startLineDistanceM=null;
    const row={
      stepIndex:i,
      from:String(r0.mark||""),
      to:String(r1.mark||""),
      lap:r0.lap??0,
      r0GateOK:!!r0.roundingGateOK,
      r1GateOK:!!r1.roundingGateOK,
      r0ExitIdx:r0.exitIdx??null,
      r1EntryIdx:r1.entryIdx??null,
      gateDebug:null,
      legPathDef:"closest",
      committeeLineCrossingIdx:null,
      startLineDistanceSignedM:null,
      usedGateIdxClip:false,
      status:"pending",
      startIdx:0,endIdx:0,legPtsCount:0,
    };
    if(!wA||!wB){
      row.status="no_waypoints";
      row.startIdx=si;row.endIdx=ei;row.legPtsCount=Math.max(0,ei-si+1);
      legBuildLog.push(row);
      nextFrom=Math.max(nextFrom,ei);
      continue;
    }
    let wPrevLL=null;
    if(i>0){
      const rp=roundings[i-1];
      wPrevLL=String(rp.mark)==="START"&&sfMid?sfMid:(getWP(rp)||null);
    }
    const hasR2=i+2<roundings.length;
    const r2=hasR2?roundings[i+2]:null;
    const wAfterLL=r2?(String(r2.mark)==="FINISH"&&sfMid?sfMid:(getWP(r2)||null)):null;
    const nameAfterR2=hasR2?String(r2.mark||""):null;
    const legMapCtx={wPrev:wPrevLL,wAfter:wAfterLL,nameAfter:nameAfterR2};
    const g=findMapLegGates(pts,wA.lat,wA.lon,wB.lat,wB.lon,nextFrom,si,ei,r0.mark,startFinishLine,gpsToBowM,windFromDeg,r0.tack??null,r1.tack??null,String(r1.mark||""),windwardMarkName,legMapCtx);
    const gateFinderBeforeClip={startIdx:g.startIdx,endIdx:g.endIdx};
    row.gateDebug=g.gateDebug||null;
    row.legPathDef=g.legPathDef||"closest";
    row.committeeLineCrossingIdx=g.committeeLineCrossingIdx??null;
    row.startLineDistanceSignedM=g.startLineDistanceSignedM!=null?g.startLineDistanceSignedM:null;
    startIdx=g.startIdx;endIdx=g.endIdx;roundingM=g.roundingM??0;legPathDef=g.legPathDef||"closest";roundingKind=g.roundingKind??null;roundingStraightM=null;
    if(String(r0.mark)==="START"&&g.startLineDistanceSignedM!=null)startLineDistanceM=g.startLineDistanceSignedM;
    if(String(r0.mark)!=="START"&&r0.roundingGateOK&&r0.exitIdx!=null)startIdx=r0.exitIdx;
    if(String(r1.mark)!=="FINISH"&&r1.roundingGateOK&&r1.entryIdx!=null)endIdx=r1.entryIdx;
    row.usedGateIdxClip=(String(r0.mark)!=="START"&&r0.roundingGateOK&&r0.exitIdx!=null)||(String(r1.mark)!=="FINISH"&&r1.roundingGateOK&&r1.entryIdx!=null);
    if(endIdx<=startIdx||endIdx-startIdx+1<2){
      startIdx=g.startIdx;endIdx=g.endIdx;legPathDef=g.legPathDef||"closest";roundingKind=g.roundingKind??null;
      roundingM=g.roundingM??0;roundingStraightM=null;
      if(String(r0.mark)==="START"&&g.startLineDistanceSignedM!=null)startLineDistanceM=g.startLineDistanceSignedM;
      row.usedGateIdxClip=false;
    }else{
      legPathDef="map_gates";
      if(r0.mark!=="START"&&r0.roundingGateOK&&r0.roundingTrackM!=null&&Number.isFinite(r0.roundingTrackM)&&r0.roundingTrackM>0){
        roundingM=r0.roundingTrackM;roundingKind="gate_in_out_m";
        row.roundingMNote="Meters along the densified track between the detected in-gate and out-gate (not chord); tacks and path inside the band add distance. Compare to roundingStraightM if present.";
        if(r0.roundingStraightM!=null&&Number.isFinite(r0.roundingStraightM))roundingStraightM=r0.roundingStraightM;
      }else if(String(r0.mark)==="START"&&g.startLineDistanceSignedM!=null){
        startLineDistanceM=g.startLineDistanceSignedM;roundingM=0;roundingKind="sf_line_m";
      }
    }
    const fromStart=String(r0.mark)==="START"&&startLineDistanceM!=null;
    row.startIdx=startIdx;row.endIdx=endIdx;
    if(row.usedGateIdxClip&&row.gateDebug&&(gateFinderBeforeClip.startIdx!==startIdx||gateFinderBeforeClip.endIdx!==endIdx)){
      row.gateDebug={
        ...row.gateDebug,
        legWindowUsesRoundingClip:true,
        gateFinderLegWindow:{startIdx:gateFinderBeforeClip.startIdx,endIdx:gateFinderBeforeClip.endIdx},
        note:"row startIdx/endIdx follow mark exit/entry when set; cAIdx/cBIdx are from per-leg gate finder (see gateFinderLegWindow if they differ).",
      };
    }
    const legPts=pts.slice(startIdx,endIdx+1);
    row.legPtsCount=legPts.length;
    nextFrom=endIdx;
    if(legPts.length<LEG_MIN_TRACK_POINTS){
      row.status="skipped_too_few_points";
      legBuildLog.push(row);
      continue;
    }
    row.status="included";
    const dist=legPts.reduce((a,p)=>a+(p.dist||0),0);
    const straightDist=hav(legPts[0].lat,legPts[0].lon,legPts[legPts.length-1].lat,legPts[legPts.length-1].lon);
    const speeds=legPts.map(p=>ms2k(p.ss||0)).filter(s=>s>0.3);
    const avgSpd=speeds.length?speeds.reduce((a,b)=>a+b,0)/speeds.length:0;
    const maxSpd=speeds.length?Math.max(...speeds):0;
    const dur=legPts[legPts.length-1].time-legPts[0].time;
    const eff=dist>0?(straightDist/dist*100):100;
    const legBearing=bear(legPts[0].lat,legPts[0].lon,legPts[legPts.length-1].lat,legPts[legPts.length-1].lon);
    let markChordBearingDeg=null,markChordM=null;
    if(wA&&wB&&Number.isFinite(wA.lat)&&Number.isFinite(wA.lon)&&Number.isFinite(wB.lat)&&Number.isFinite(wB.lon)){
      markChordBearingDeg=bear(wA.lat,wA.lon,wB.lat,wB.lon);
      markChordM=hav(wA.lat,wA.lon,wB.lat,wB.lon);
    }
    legBuildLog.push(row);
    legs.push({
      from:roundings[i].mark,to:roundings[i+1].mark,
      lap:roundings[i].lap,
      startIdx,endIdx,
      distance:dist,straightDistance:straightDist,markChordBearingDeg,markChordM,
      duration:dur,avgSpeed:avgSpd,maxSpeed:maxSpd,
      efficiency:eff,legBearing,
      type:"leg",
      roundingM:fromStart?null:roundingM,
      roundingStraightM:fromStart?null:roundingStraightM,
      startLineDistanceM,
      legPathDef,roundingKind,
    });
  }
  return{legs,legBuildLog};
}

function detectLegsFromMarks(pts,markPositions,laps,preamble=null,startFinishLine=null,gpsToBowM=2,windFromDeg=null,windwardMarkName=null,committeeLineInject=null){
  const injStart=!committeeLineInject||committeeLineInject.injectStart!==false;
  const injFinish=!committeeLineInject||committeeLineInject.injectFinish!==false;
  const emptyDiag={markSequenceLog:[],legBuildLog:[]};
  const fullSeq=expandCourseMarks(preamble,markPositions||[],laps);
  if(fullSeq.length<2){
    return{legs:[],roundings:[],markSequenceLog:[{error:"need_at_least_2_marks",expandedCount:fullSeq.length,hint:"Preamble + lap marks need at least two waypoints with GPS (e.g. two mark rows in the WSC order)."}],legBuildLog:[]};
  }

  const sfMid=startFinishLine?.endA&&startFinishLine?.endB?{
    lat:(startFinishLine.endA.lat+startFinishLine.endB.lat)/2,
    lon:(startFinishLine.endA.lon+startFinishLine.endB.lon)/2
  }:null;
  const wpFromRow=row=>(row&&row.lat!=null&&row.lon!=null&&Number.isFinite(row.lat)&&Number.isFinite(row.lon)
    ?{lat:row.lat,lon:row.lon}:null);

  const roundings=[];
  const markSequenceLog=[];
  let searchFrom=0;
  const gatePts=densifyGpsTrack(pts,{maxStepM:4,maxTimeSec:1});
  const mapGateIdxToOrig=gi=>{
    if(gi==null||!Number.isFinite(gi)||gi<0)return 0;
    if(gi>=gatePts.length)return pts.length-1;
    return nearestTimeIndexInSortedGps(pts,gatePts[gi].time);
  };

  for(let mi=0;mi<fullSeq.length;mi++){
    const m=fullSeq[mi];
    const curr=wpFromRow(m);
    if(!curr){
      markSequenceLog.push({orderIndex:mi,mark:m?.name,error:"no_mark_coords"});
      return{legs:[],roundings,markSequenceLog,legBuildLog:[]};
    }
    let prev=null;
    if(mi>0){
      const pr=fullSeq[mi-1];
      prev=wpFromRow(pr)??(String(pr.name)==="START"&&sfMid?sfMid:null);
    }else if(sfMid)prev=sfMid;
    let nextW=null;
    if(mi+1<fullSeq.length){
      const nx=fullSeq[mi+1];
      nextW=wpFromRow(nx)??(String(nx.name)==="FINISH"&&sfMid?sfMid:null);
    }else if(sfMid)nextW=sfMid;
    const needVirtPrev=!prev&&!!nextW;
    const needVirtNext=!nextW&&!!prev;
    if(needVirtPrev)prev=virtualPrevForFirstMarkApproach(curr,nextW,500);
    if(needVirtNext)nextW=virtualNextAfterLastMark(prev,curr,500);
    if(!prev||!nextW){
      markSequenceLog.push({orderIndex:mi,mark:m.name,error:"incomplete_neighbours",hasPrev:!!prev,hasNext:!!nextW,note:"Could not set virtual prev/next (need curr + neighbour mark)."});
      return{legs:[],roundings,markSequenceLog,legBuildLog:[]};
    }
    const synN=needVirtPrev||needVirtNext;
    const g2=detectMarkInboundOutboundGates(gatePts,prev,curr,nextW,searchFrom,m.tack??null,windFromDeg,String(m.name||""),windwardMarkName,mi+1<fullSeq.length?String((fullSeq[mi+1]||{}).name||""):"");
    if(g2.ok){
      const exitO=mapGateIdxToOrig(g2.exitIdx),entO=mapGateIdxToOrig(g2.entryIdx);
      const dExit=hav(gatePts[g2.exitIdx].lat,gatePts[g2.exitIdx].lon,m.lat,m.lon);
      markSequenceLog.push({orderIndex:mi,mark:m.name,lap:m.lap,gateOk:true,entryIdx:entO,exitIdx:exitO,roundingTrackM:g2.trackM,syntheticNeighbours:synN,gateDetDebug:g2.gateDetDebug??null});
      roundings.push({
        mark:m.name,idx:exitO,dist:dExit,lap:m.lap,lat:m.lat,lon:m.lon,tack:m.tack??null,
        entryIdx:entO,exitIdx:exitO,roundingTrackM:g2.trackM,roundingStraightM:g2.straightM,roundingGateOK:true,
      });
      searchFrom=g2.exitIdx;
    }else{
      let bestI=-1,bestD=Infinity;
      for(let k=searchFrom;k<gatePts.length;k++){
        const d=hav(gatePts[k].lat,gatePts[k].lon,m.lat,m.lon);
        if(d<bestD){bestD=d;bestI=k;}
      }
      if(bestI<0){
        markSequenceLog.push({orderIndex:mi,mark:m.name,lap:m.lap,gateOk:false,fail:"no_track_points",nearestDistM:null,nearestIdx:null,searchFrom,aborted:true,syntheticNeighbours:synN});
        break;
      }
      markSequenceLog.push({
        orderIndex:mi,mark:m.name,lap:m.lap,gateOk:false,fail:"gates_not_found",
        hint:"In then out on the map gate lines (135°/chord/L135) not found in order from here — check wind, tack P/S, crop, or mark order. Nearest approach is diagnostic only.",
        nearestDistM:bestD,nearestIdx:bestI>=0?mapGateIdxToOrig(bestI):null,searchFrom,syntheticNeighbours:synN,
        gateDetDebug:g2.gateDetDebug??null,
        searchFromDensifyIdx:searchFrom,
        searchFromOrigTrackIdx:mapGateIdxToOrig(searchFrom),
        noteGpsIndices:"`searchFrom` is on the 4m/1s densified track; `searchFromOrigTrackIdx` is the nearest point on the main (analysis) track. If `lax=0` for in, the in-line crossing may be before `searchFrom` (already past the in-gate) or the line/weather/tack is inconsistent with the track.",
      });
      break;
    }
  }

  if(startFinishLine?.endA&&startFinishLine?.endB&&roundings.length){
    if(injStart){
      const firstBound=roundings[0].entryIdx!=null?roundings[0].entryIdx:roundings[0].idx;
      const startPick=closestIndexToLine(pts,startFinishLine.endA,startFinishLine.endB,0,Math.max(0,firstBound));
      if(startPick.idx>=0&&startPick.idx<roundings[0].idx){
        roundings.unshift({
          mark:"START",idx:startPick.idx,dist:startPick.dist,lap:0,lat:null,lon:null,tack:null,
          roundingGateOK:false,entryIdx:null,exitIdx:null,roundingTrackM:null,roundingStraightM:null,
        });
      }
    }
    if(injFinish){
      const lastIdx=roundings[roundings.length-1].idx;
      const finishPick=closestIndexToLine(pts,startFinishLine.endA,startFinishLine.endB,lastIdx,pts.length-1);
      if(finishPick.idx>lastIdx){
        roundings.push({
          mark:"FINISH",idx:finishPick.idx,dist:finishPick.dist,lap:roundings[roundings.length-1].lap,lat:null,lon:null,tack:null,
          roundingGateOK:false,entryIdx:null,exitIdx:null,roundingTrackM:null,roundingStraightM:null,
        });
      }
    }
  }

  const{legs,legBuildLog}=buildLegsFromRoundingsArray(pts,roundings,sfMid,startFinishLine,gpsToBowM,windFromDeg,windwardMarkName);
  return{legs,roundings,markSequenceLog,legBuildLog};
}

/** Leg whose index range contains track sample `j` (e.g. tack wind-crossing index). */
function findLegContainingTrackIndex(legs,j){
  if(!legs||!(j>=0))return null;
  const jj=j|0;
  for(const leg of legs){
    if(leg.startIdx!=null&&leg.endIdx!=null&&jj>=leg.startIdx&&jj<=leg.endIdx)return leg;
  }
  return null;
}

/** Sum of |ΔCOG| between consecutive points (integrated turn magnitude, °). */
function cumulativeTurnDeg(pts,i0,i1){
  if(!pts||i1<=i0)return 0;
  let s=0;
  for(let i=i0;i<i1;i++){
    const c0=pts[i].cog,c1=pts[i+1].cog;
    if(Number.isFinite(c0)&&Number.isFinite(c1))s+=Math.abs(adiff(c0,c1));
  }
  return Math.round(s*10)/10;
}

function expandMarkRoundingZone(pts,peakIdx,mLat,mLon,entryIdx,exitIdx){
  if(entryIdx!=null&&exitIdx!=null&&Number.isFinite(entryIdx)&&Number.isFinite(exitIdx)&&
    exitIdx>=entryIdx&&exitIdx<pts.length&&entryIdx>=0){
    return{z0:entryIdx|0,z1:Math.min(exitIdx,pts.length-1)};
  }
  if(!pts?.length||peakIdx<0||peakIdx>=pts.length||mLat==null||mLon==null)return{z0:Math.max(0,peakIdx|0),z1:Math.max(0,peakIdx|0)};
  let z0=peakIdx,z1=peakIdx;
  const tMid=pts[peakIdx].time;
  const tMin=tMid-MARK_ROUND_MAX_SPAN_SEC/2;
  const tMax=tMid+MARK_ROUND_MAX_SPAN_SEC/2;
  while(z0>0&&pts[z0-1].time>=tMin&&hav(pts[z0-1].lat,pts[z0-1].lon,mLat,mLon)<=MARK_ROUND_ZONE_M)z0--;
  while(z1<pts.length-1&&pts[z1+1].time<=tMax&&hav(pts[z1+1].lat,pts[z1+1].lon,mLat,mLon)<=MARK_ROUND_ZONE_M)z1++;
  return{z0,z1};
}

function manoeuvreOverlapsZone(m,z0,z1){
  if(!m?.preSegment||!m.postSegment)return false;
  const a=m.preSegment.startIdx,b=m.postSegment.endIdx;
  return b>=z0&&a<=z1;
}

function manoeuvreIntervalInZone(m,z0,z1){
  const a=m.preSegment.startIdx,b=m.postSegment.endIdx;
  return{lo:Math.max(z0,a),hi:Math.min(z1,b)};
}

function splitRoleAtMark(tIdx,peakIdx){
  if(tIdx<peakIdx-2)return"before_closest";
  if(tIdx>peakIdx+2)return"after_closest";
  return"at_closest";
}

/**
 * Per-mark rounding geometry + links to manoeuvres whose detection window overlaps the zone.
 * START/FINISH rows are skipped (no mark lat/lon).
 */
function analyzeMarkRoundingDetails(pts,roundings,manoeuvreEvents){
  if(!roundings?.length)return[];
  const mans=Array.isArray(manoeuvreEvents)?manoeuvreEvents:[];
  return roundings.map(r=>{
    const isSF=r.mark==="START"||r.mark==="FINISH";
    if(isSF||r.lat==null||r.lon==null||!Number.isFinite(r.lat)||!Number.isFinite(r.lon)){
      return{raw:r,skipped:true};
    }
    const peak=(r.exitIdx!=null?r.exitIdx:r.idx);
    const{z0,z1}=expandMarkRoundingZone(pts,peak,r.lat,r.lon,r.entryIdx,r.exitIdx);
    const totalTurnInZoneDeg=cumulativeTurnDeg(pts,z0,z1);
    const c0=pts[z0].cog,c1=pts[z1].cog;
    const netBearingChangeDeg=Number.isFinite(c0)&&Number.isFinite(c1)?Math.round(Math.abs(adiff(c0,c1))*10)/10:0;
    const durationSec=pts[z1].time-pts[z0].time;
    const linkedManoeuvres=[];
    for(const m of mans){
      if(!manoeuvreOverlapsZone(m,z0,z1))continue;
      const iv=manoeuvreIntervalInZone(m,z0,z1);
      const manoeuvrePortionDeg=iv.hi>iv.lo?cumulativeTurnDeg(pts,iv.lo,iv.hi):0;
      const tIdx=m.turnIdx??m.idx;
      const markArcResidualDeg=Math.max(0,Math.round((totalTurnInZoneDeg-manoeuvrePortionDeg)*10)/10);
      linkedManoeuvres.push({
        type:m.type,turnIdx:tIdx,detectionIdx:m.idx,
        manoeuvrePortionDeg,markArcResidualDeg,
        splitRole:splitRoleAtMark(tIdx,peak),
        detectionAngleDeg:Math.round(Number(m.ch)||0),
      });
    }
    return{
      mark:r.mark,lap:r.lap,roundTack:r.tack??null,
      markLat:r.lat,markLon:r.lon,
      closestIdx:peak,closestDistM:r.dist,
      zoneStartIdx:z0,zoneEndIdx:z1,
      totalTurnInZoneDeg,netBearingChangeDeg,durationSec,
      linkedManoeuvres,skipped:false,
    };
  });
}

function findBestMarkRoundingDetail(m,details){
  if(!details?.length||!m?.preSegment)return null;
  const tIdx=m.turnIdx??m.idx;
  let best=null,bestScore=Infinity;
  for(const d of details){
    if(d.skipped||d.zoneStartIdx==null)continue;
    const z0=d.zoneStartIdx,z1=d.zoneEndIdx;
    if(tIdx<z0||tIdx>z1)continue;
    if(!manoeuvreOverlapsZone(m,z0,z1))continue;
    const sc=Math.abs(tIdx-d.closestIdx);
    if(sc<bestScore){bestScore=sc;best=d;}
  }
  return best;
}

function buildMarkRoundingContext(pts,m,detail){
  if(!detail||detail.skipped)return null;
  const z0=detail.zoneStartIdx,z1=detail.zoneEndIdx;
  const iv=manoeuvreIntervalInZone(m,z0,z1);
  const manoeuvrePortionDeg=iv.hi>iv.lo?cumulativeTurnDeg(pts,iv.lo,iv.hi):0;
  const tIdx=m.turnIdx??m.idx;
  const markArcResidualDeg=Math.max(0,Math.round((detail.totalTurnInZoneDeg-manoeuvrePortionDeg)*10)/10);
  return{
    mark:detail.mark,lap:detail.lap,roundTack:detail.roundTack,
    closestIdx:detail.closestIdx,zoneStartIdx:z0,zoneEndIdx:z1,
    totalTurnInZoneDeg:detail.totalTurnInZoneDeg,
    netBearingChangeDeg:detail.netBearingChangeDeg,
    manoeuvrePortionDeg:Math.round(manoeuvrePortionDeg*10)/10,
    markArcResidualDeg,
    splitRole:splitRoleAtMark(tIdx,detail.closestIdx),
    detectionAngleDeg:Math.round(Number(m.ch)||0),
  };
}

/** True if a racing (non–mark-manoeuvre) gybe’s turn lies on this leg. */
function racingGybeIntersectsLeg(leg,g){
  if(!g||g.type!=="gybe"||g.excludeFromStatsAndVMG)return false;
  const ti=g.turnIdx??g.idx;
  if(!Number.isFinite(ti)||!Number.isFinite(leg.startIdx)||!Number.isFinite(leg.endIdx))return false;
  return ti>=leg.startIdx&&ti<=leg.endIdx;
}

function classifyLegs(legs,wd,gybeEvents=null){
  return legs.map(l=>{
    const rel=((l.legBearing-wd+360)%360);
    let type;
    if(isUpwindLegBearingVsWindDeg(l.legBearing,wd))type="upwind";
    else if(rel>120&&rel<240){
      type="downwind";
      const hasRacingGybe=(gybeEvents||[]).some(g=>racingGybeIntersectsLeg(l,g));
      if(!hasRacingGybe)type="reach";
    }
    else type="reach";

    return{...l,type};
  });
}

/** Acute true wind angle (°): angle between COG and wind FROM (0–180). */
function acuteTwaFromWindDeg(cog,wdFrom){
  const r=((Number(cog)-wdFrom+360)%360);
  return r>180?360-r:r;
}
/** Acute angle (°) between COG and a reference bearing (0–180). */
function acuteAngleToBearingDeg(cogDeg,refBearingDeg){
  if(!Number.isFinite(cogDeg)||!Number.isFinite(refBearingDeg))return null;
  const r=((Number(cogDeg)-refBearingDeg+360)%360);
  return r>180?360-r:r;
}
/** Component of speed toward true wind: SOG (kts) × cos(TWA) vs wind from. */
function vmgToWindKts(sogKts,cogDeg,windFromDeg){
  if(!Number.isFinite(sogKts)||!Number.isFinite(cogDeg)||!Number.isFinite(windFromDeg))return null;
  const twa=acuteTwaFromWindDeg(cogDeg,windFromDeg);
  return sogKts*Math.cos(twa*D);
}

const MANEUVER_CHART_SAMPLE_STEP_SEC=0.25;
/** Half-width (s) of tack VMG chart and **mean VMG** sample each side of wind-line crossing (T). */
const MANEUVER_CHART_HALF_WINDOW_SEC=10;
/** For manoeuvre **performance** stats only: earliest turn initiation time is T−this many seconds (ignore earlier steer-in). */
const MANEUVER_INIT_WINDOW_BEFORE_CROSS_SEC=10;
/** Half-width (s) each side of `t_cross` for upwind-only reference VMG (total 60s = “1 min”). */
const TACK_REF_UPWIND_WINDOW_HALF_SEC=30;

/** Per GPS index: leg type (`upwind` / `reach` / `downwind`) from analysed legs, else null. */
function buildPointLegTypeArray(pts,legs){
  const n=pts?.length||0;
  const out=new Array(n).fill(null);
  if(!legs||!legs.length)return out;
  for(const leg of legs){
    if(leg.startIdx==null||leg.endIdx==null)continue;
    const a=Math.max(0,leg.startIdx|0),b=Math.min(n-1,leg.endIdx|0);
    const typ=leg.type||null;
    for(let i=a;i<=b;i++)out[i]=typ;
  }
  return out;
}
/** Mean VMG to wind (kts) on [t0,t1] by sampling at `step` (any leg). */
function meanVmgToWindInTimeIntervalSampled(pts,t0,t1,windFromDeg,step){
  if(!(t1>t0)||!Number.isFinite(windFromDeg))return null;
  let sum=0,cnt=0;
  for(let t=t0;t<=t1+1e-9;t+=step){
    const sp=speedKtsAtTime(pts,t);
    const cg=cogDegAtTime(pts,t);
    if(sp==null||cg==null)continue;
    const v=vmgToWindKts(sp,cg,windFromDeg);
    if(v!=null&&Number.isFinite(v)){sum+=v;cnt++;}
  }
  return cnt?+(sum/cnt).toFixed(3):null;
}
/** Mean VMG to wind on [t0,t1] using only samples whose index maps to **upwind** legs and is outside mark-rounding mask. */
function meanVmgUpwindOnlyInTimeWindow(pts,t0,t1,windFromDeg,legTypeByIdx,roundingMask,step,minSamples=4){
  if(!(t1>t0)||!Number.isFinite(windFromDeg)||!legTypeByIdx?.length)return null;
  let sum=0,cnt=0;
  for(let t=t0;t<=t1+1e-9;t+=step){
    const j=nearestTimeIndexInSortedGps(pts,t);
    if(legTypeByIdx[j]!=="upwind")continue;
    if(roundingMask&&roundingMask[j])continue;
    const sp=speedKtsAtTime(pts,t);
    const cg=cogDegAtTime(pts,t);
    if(sp==null||cg==null)continue;
    const v=vmgToWindKts(sp,cg,windFromDeg);
    if(v!=null&&Number.isFinite(v)){sum+=v;cnt++;}
  }
  return cnt>=minSamples?+(sum/cnt).toFixed(3):null;
}
/** Sets `tack.q` = % of upwind reference VMG retained through the tack; adds tack + ref VMG fields on tack and `performance`. */
function applyTackVmgQualityVsUpwindRef(pts,tack,windFromDeg,legs,roundingMask){
  if(!tack||tack.type!=="tack"||!tack.performance)return;
  const p=tack.performance;
  const tCross=Number(p.t_cross),tInit=Number(p.t_init),tComplete=Number(p.t_complete);
  if(!Number.isFinite(tCross)||!Number.isFinite(tInit)||!Number.isFinite(tComplete))return;
  const legTypeByIdx=buildPointLegTypeArray(pts,legs);
  const step=MANEUVER_CHART_SAMPLE_STEP_SEC;
  const w0=tCross-TACK_REF_UPWIND_WINDOW_HALF_SEC,w1=tCross+TACK_REF_UPWIND_WINDOW_HALF_SEC;
  let refMean=meanVmgUpwindOnlyInTimeWindow(pts,w0,w1,windFromDeg,legTypeByIdx,roundingMask,step);
  let refSource="window";
  if(refMean==null||!Number.isFinite(Number(refMean))){
    const jCross=nearestTimeIndexInSortedGps(pts,tCross);
    const leg=findLegContainingTrackIndex(legs,jCross);
    const legV=leg&&(leg.avgVmgToWind!=null&&Number.isFinite(leg.avgVmgToWind)?leg.avgVmgToWind:leg.avgVMG);
    if(legV!=null&&Number.isFinite(legV)&&Math.abs(legV)>0.05)refMean=+Number(legV).toFixed(3),refSource="leg";
  }
  const tackMean=meanVmgToWindInTimeIntervalSampled(pts,tInit,tComplete,windFromDeg,step);
  const refN=refMean!=null&&Number.isFinite(Number(refMean))?Number(refMean):null;
  const tackN=tackMean!=null?Number(tackMean):null;
  tack.refUpwindWindowVmgKts=refN;
  tack.refVmgSource=refSource;
  tack.tackMeanVmgKts=tackN;
  p.ref_upwind_60s_window_vmg_kts=refN;
  p.ref_vmg_source=refSource;
  p.tack_mean_vmg_turn_kts=tackN;
  if(refN!=null&&tackN!=null&&refN>0.08)tack.q=Math.max(0,Math.min(120,Math.round(100*tackN/refN)));
  else tack.q=null;
}

/** VMG to wind vs **tRel = time − t_cross**; window [T−10s, T+10s]. */
function buildManeuverWindowChartSeries(pts,performance,windFromDeg){
  if(!pts?.length||!performance||typeof performance!=="object")return null;
  const tInit=Number(performance.t_init),tComplete=Number(performance.t_complete),tCross=Number(performance.t_cross);
  if(!Number.isFinite(tInit)||!Number.isFinite(tComplete)||!Number.isFinite(tCross)||!Number.isFinite(windFromDeg))return null;
  const half=MANEUVER_CHART_HALF_WINDOW_SEC;
  const tStart=tCross-half,tEnd=tCross+half;
  if(!(tEnd>tStart))return null;
  const step=MANEUVER_CHART_SAMPLE_STEP_SEC;
  const data=[];
  for(let ta=tStart;ta<=tEnd+1e-9;ta+=step){
    const tRel=+(ta-tCross).toFixed(2);
    const sp=speedKtsAtTime(pts,ta);
    const cg=cogDegAtTime(pts,ta);
    let vmg=null;
    if(sp!=null&&cg!=null&&Number.isFinite(sp)&&Number.isFinite(cg))vmg=vmgToWindKts(sp,cg,windFromDeg);
    data.push({
      tRel,
      vmg:vmg!=null&&Number.isFinite(vmg)?+vmg.toFixed(3):null,
    });
  }
  return{
    data,
    markers:{
      tRel_turn_start:+(tInit-tCross).toFixed(2),
      tRel_cross:0,
      tRel_turn_end:+(tComplete-tCross).toFixed(2),
    },
  };
}
/** Turn window refs for chart overlays; uses perfChart or recomputes from performance times. */
function manoeuvreChartMarkersFromTack(t){
  if(!t)return null;
  const mk=t.perfChart?.markers;
  if(mk&&Number.isFinite(Number(mk.tRel_turn_start))&&Number.isFinite(Number(mk.tRel_turn_end)))return mk;
  const p=t.performance;
  if(!p||typeof p!=="object")return null;
  const tInit=Number(p.t_init),tComplete=Number(p.t_complete),tCross=Number(p.t_cross);
  if(!Number.isFinite(tInit)||!Number.isFinite(tComplete)||!Number.isFinite(tCross))return null;
  return{
    tRel_turn_start:+(tInit-tCross).toFixed(2),
    tRel_cross:0,
    tRel_turn_end:+(tComplete-tCross).toFixed(2),
  };
}

/** Mean VMG to true wind (kts) over `tCross ± halfSec` at `MANEUVER_CHART_SAMPLE_STEP_SEC` (same grid as overlay chart). */
function meanVmgToWindAroundCrossing(pts,tCross,windFromDeg,halfSec=MANEUVER_CHART_HALF_WINDOW_SEC){
  if(!pts?.length||!Number.isFinite(tCross)||!Number.isFinite(windFromDeg))return null;
  const step=MANEUVER_CHART_SAMPLE_STEP_SEC;
  let sum=0,n=0;
  for(let tr=-halfSec;tr<=halfSec+1e-9;tr+=step){
    const ta=tCross+tr;
    const sp=speedKtsAtTime(pts,ta);
    const cg=cogDegAtTime(pts,ta);
    if(sp==null||cg==null||!Number.isFinite(sp)||!Number.isFinite(cg))continue;
    const v=vmgToWindKts(sp,cg,windFromDeg);
    if(v!=null&&Number.isFinite(v)){sum+=v;n++;}
  }
  return n?+(sum/n).toFixed(3):null;
}

function buildAllTacksVmgOverlayData(pts,tacks,windFromDeg,halfSec=MANEUVER_CHART_HALF_WINDOW_SEC){
  if(!pts?.length||!tacks?.length||!Number.isFinite(windFromDeg))return[];
  const step=MANEUVER_CHART_SAMPLE_STEP_SEC;
  const rows=[];
  for(let tr=-halfSec;tr<=halfSec+1e-9;tr+=step){
    const row={tRel:+tr.toFixed(2)};
    tacks.forEach((t,i)=>{
      let v=null;
      const tc=tackWindCrossingTimeSec(t,pts);
      if(Number.isFinite(tc)){
        const ta=tc+tr;
        const sp=speedKtsAtTime(pts,ta);
        const cg=cogDegAtTime(pts,ta);
        if(sp!=null&&cg!=null&&Number.isFinite(sp)&&Number.isFinite(cg))v=vmgToWindKts(sp,cg,windFromDeg);
      }
      row[`vmg_${i}`]=v!=null&&Number.isFinite(v)?+v.toFixed(3):null;
    });
    rows.push(row);
  }
  return rows;
}
/** Unix time (s) at wind-line crossing: performance.t_cross, else GPS time at turnIdx/idx. */
function tackWindCrossingTimeSec(t,pts){
  if(!t||!pts?.length)return null;
  if(t.performance&&Number.isFinite(Number(t.performance.t_cross)))return Number(t.performance.t_cross);
  const ix=Math.max(0,Math.min(pts.length-1,t.turnIdx??t.idx??0));
  const tm=pts[ix]?.time;
  return Number.isFinite(tm)?tm:null;
}
/** VMC (kts) along bearing mark A → mark B (chord): SOG × cos(acute(COG, chord)). */
function vmcToMarkBearingKts(sogKts,cogDeg,markChordBearingDeg){
  if(!Number.isFinite(sogKts)||!Number.isFinite(cogDeg)||!Number.isFinite(markChordBearingDeg))return null;
  const va=acuteAngleToBearingDeg(cogDeg,markChordBearingDeg);
  if(va==null||!Number.isFinite(va))return null;
  return sogKts*Math.cos(va*D);
}
/** Trapezoid-style weight (sec) for time-weighted sample means at `idx`. */
function pointTimeWeightSec(pts,idx){
  if(!pts?.length||idx<0||idx>=pts.length)return 0;
  const t=pts[idx].time;
  const tPrev=idx>0?pts[idx-1].time:t;
  const tNext=idx<pts.length-1?pts[idx+1].time:t;
  return Math.max(1e-3,0.5*(tNext-tPrev));
}

function circularMeanStdDeg(cogs){
  if(!cogs||!cogs.length)return{mean:null,std:null,n:0};
  let sx=0,sy=0;
  for(const c of cogs){
    const rad=c*D;
    sx+=Math.cos(rad);sy+=Math.sin(rad);
  }
  const n=cogs.length;
  sx/=n;sy/=n;
  const R=Math.hypot(sx,sy);
  const mean=(Math.atan2(sy,sx)/D+360)%360;
  const stdDeg=R>1e-6?Math.sqrt(Math.max(0,-2*Math.log(R)))/D:0;
  return{mean,std:Math.min(stdDeg,120),n};
}

function sampleStdDev(arr){
  if(!arr||arr.length<2)return 0;
  const m=arr.reduce((a,b)=>a+b,0)/arr.length;
  return Math.sqrt(arr.reduce((s,x)=>s+(x-m)**2,0)/(arr.length-1));
}

/** Strip tack leg stats to JSON-safe compare fields (stored in analyses.stats). */
function tackStatsForCompareStore(t){
  if(!t)return null;
  const trim=(x)=>({
    n:x.n??0,
    avgSpeed:x.avgSpeed??null,
    speedStd:x.speedStd??null,
    avgVMG:x.avgVmgToWind??x.avgVMG??null,
    avgVmgToWind:x.avgVmgToWind??x.avgVMG??null,
    avgCourse:x.avgCourse??null,
    twaFromWind:x.twaFromWind??null,
    twaStd:x.twaStd??null,
    courseStd:x.courseStd??null,
  });
  return{
    port:trim(t.port||{}),
    stbd:trim(t.stbd||{}),
    portSamplePct:t.portSamplePct??null,
    stbdSamplePct:t.stbdSamplePct??null,
    p2sTwaDiff:t.p2sTwaDiff??null,
  };
}

/**
 * Speed / COG / VMG to wind for legs of a given type, split by tack (port vs starboard).
 * @param {"upwind"|"reach"|"downwind"} legType
 */
function computeTackLegStatsByType(en,legs,wd,legType,roundingMask=null){
  const port=[],stbd=[];
  const skip=i=>roundingMask&&roundingMask.length>i&&roundingMask[i];
  for(const l of legs||[]){
    if(l.type!==legType||l.startIdx==null||l.endIdx==null)continue;
    for(let i=l.startIdx;i<=l.endIdx&&i<en.length;i++){
      if(skip(i))continue;
      const p=en[i],s=ms2k(p.ss||0);
      if(s<0.3)continue;
      const vmg=vmgToWindKts(s,p.cog,wd);
      if(vmg==null||!Number.isFinite(vmg))continue;
      const w=pointTimeWeightSec(en,i);
      const o={s,cog:p.cog,vmg,w};
      const r=((p.cog-wd+360)%360);
      if(r>180)stbd.push(o);else port.push(o);
    }
  }
  const pack=(arr)=>{
    if(!arr.length)return{n:0,avgSpeed:null,speedStd:null,avgCourse:null,courseStd:null,avgVmgToWind:null,avgVMG:null,twaFromWind:null,twaStd:null,windRelLabel:null};
    const spds=arr.map(x=>x.s),cogs=arr.map(x=>x.cog),vmgs=arr.map(x=>x.vmg),weights=arr.map(x=>x.w||0);
    const twaSamples=arr.map(x=>acuteTwaFromWindDeg(x.cog,wd));
    const avgSpeed=spds.reduce((a,b)=>a+b,0)/spds.length;
    const speedStd=sampleStdDev(spds);
    const{mean:avgCourse,std:courseStd}=circularMeanStdDeg(cogs);
    const twaStd=twaSamples.length>=2?sampleStdDev(twaSamples):null;
    const wSum=weights.reduce((a,b)=>a+b,0);
    const avgVmgToWind=wSum>0?vmgs.reduce((s,v,j)=>s+v*weights[j],0)/wSum:(vmgs.length?vmgs.reduce((a,b)=>a+b,0)/vmgs.length:null);
    const avgVMG=avgVmgToWind;
    let twaFromWind=null,windRelLabel=null;
    if(avgCourse!=null&&Number.isFinite(avgCourse)){
      const acute=acuteTwaFromWindDeg(avgCourse,wd);
      twaFromWind=acute;
      const signedFromWind=((avgCourse-wd+540)%360)-180;
      windRelLabel=`COG ${Math.round(avgCourse)}° (${signedFromWind>=0?"+":""}${Math.round(signedFromWind)}° from wind) · ${Math.round(acute)}° TWA`;
    }
    return{n:arr.length,avgSpeed,speedStd,avgCourse,courseStd,avgVmgToWind,avgVMG,twaFromWind,twaStd,windRelLabel};
  };
  const P=pack(port),S=pack(stbd);
  const tot=P.n+S.n;
  const portSamplePct=tot>0?100*P.n/tot:null;
  const stbdSamplePct=tot>0?100*S.n/tot:null;
  const p2sTwaDiff=P.twaFromWind!=null&&S.twaFromWind!=null&&Number.isFinite(P.twaFromWind)&&Number.isFinite(S.twaFromWind)
    ?Math.abs(P.twaFromWind-S.twaFromWind):null;
  return{port:P,stbd:S,portSamplePct,stbdSamplePct,p2sTwaDiff};
}

function computeUpwindTackLegStats(en,legs,wd,roundingMask=null){
  return computeTackLegStatsByType(en,legs,wd,"upwind",roundingMask);
}

function computeMaxSpeedHighlight(en,legs,wd){
  if(!en||!en.length)return null;
  let bestI=-1,bestS=-1;
  en.forEach((p,i)=>{const s=ms2k(p.ss||0);if(s>bestS){bestS=s;bestI=i;}});
  if(bestI<0||bestS<0)return null;
  const p=en[bestI],t0=en[0].time;
  const twaSample=acuteTwaFromWindDeg(p.cog,wd);
  let leg=null;
  for(const l of legs||[]){
    if(bestI>=l.startIdx&&bestI<=l.endIdx){leg=l;break;}
  }
  const legTypeLabel=leg?leg.type.charAt(0).toUpperCase()+leg.type.slice(1):"";
  const lapLabel=leg&&leg.lap!=null?(leg.lap===0?"Preamble":`Lap ${leg.lap}`):"";
  return{
    idx:bestI,
    time:p.time-t0,
    speed:parseFloat(bestS.toFixed(2)),
    twaSample,
    leg,
    legTypeLabel,
    lapLabel,
  };
}

/** Downsample for chart, but always include the global max-speed sample so markers sit on the curve. */
function buildSpeedTimeSeries(en,maxMark){
  const t0=en[0].time;
  const base=en.filter((_,i)=>i%3===0).map(p=>({
    time:p.time-t0,
    speed:parseFloat(ms2k(p.ss).toFixed(2)),
    cog:Math.round(p.cog),
  }));
  if(!maxMark||maxMark.idx==null||maxMark.idx<0||maxMark.idx>=en.length)return base;
  const t=maxMark.time,sp=maxMark.speed,cog=Math.round(en[maxMark.idx].cog);
  if(!base.length)return[{time:t,speed:sp,cog}];
  let bestJ=0,bestDt=Infinity;
  base.forEach((d,j)=>{const dt=Math.abs(d.time-t);if(dt<bestDt){bestDt=dt;bestJ=j;}});
  const step=base.length>=2?(base[base.length-1].time-base[0].time)/Math.max(1,base.length-1):2;
  const mergeRadius=Math.max(0.4,step*0.75);
  if(bestDt<=mergeRadius){
    return base.map((d,j)=>{
      if(j!==bestJ)return d;
      const ns=Math.max(d.speed,sp);
      return{...d,speed:ns,cog:d.speed<ns?cog:d.cog};
    });
  }
  return[...base,{time:t,speed:sp,cog}].sort((a,b)=>a.time-b.time);
}

/** Map / timeline manoeuvre colour from crossing (matches map badges). */
function manoeuvreBadgeBaseColor(m){
  if(m.crossing==="P→S")return MAP_MANEUVER_COLORS.port;
  if(m.crossing==="S→P")return MAP_MANEUVER_COLORS.stbd;
  return m.type==="gybe"?MAP_MANEUVER_COLORS.gybe:MAP_MANEUVER_COLORS.tack;
}

function buildTimelineDecorations(analysis){
  const t0=analysis?.points?.[0]?.time??0;
  const legBands=(analysis?.legs||[]).map((l,idx)=>{
    const x1=Math.max(0,(analysis.points?.[l.startIdx]?.time??t0)-t0);
    const x2=Math.max(x1,(analysis.points?.[l.endIdx]?.time??t0)-t0);
    const fill=l.type==="upwind"?"rgba(74, 158, 255, 0.06)":l.type==="downwind"?"rgba(255, 184, 74, 0.06)":"transparent";
    return{idx,x1,x2,fill};
  });
  const markerForTack=(m,i)=>{
    const mt=Number(m.time??t0);
    const now=windAtTime(analysis?.windTrace||[],mt,analysis?.windDir||0);
    const before=windAtTime(analysis?.windTrace||[],mt-30,now);
    const delta=adiff(before,now);
    const shiftArrow=delta>1?"▲":delta<-1?"▼":"•";
    const shiftLabel=Math.abs(delta)>=1?`${shiftArrow}${Math.round(Math.abs(delta))}°`:shiftArrow;
    const atMark=m.excludeFromStatsAndVMG;
    const base=manoeuvreBadgeBaseColor(m);
    return{x:mt-t0,color:atMark?C.trkRound:base,label:`T${i+1}${atMark?"*":""}`,kind:"tack",shiftLabel};
  };
  const markers=[
    ...(analysis?.tacks||[]).map((m,i)=>markerForTack(m,i)),
    ...(analysis?.gybes||[]).map((g,i)=>{
      const atMark=g.excludeFromStatsAndVMG;
      const base=manoeuvreBadgeBaseColor(g);
      return{x:(g.time??t0)-t0,color:atMark?C.trkRound:base,label:`G${i+1}${atMark?"*":""}`,kind:"gybe"};
    }),
  ].filter(m=>Number.isFinite(m.x)).sort((a,b)=>a.x-b.x);
  return{legBands,markers};
}

function legTypeAtAbsTime(analysis,absTime){
  if(!analysis?.legs?.length||!analysis?.points?.length)return null;
  for(const l of analysis.legs){
    const t1=analysis.points?.[l.startIdx]?.time;
    const t2=analysis.points?.[l.endIdx]?.time;
    if(!Number.isFinite(t1)||!Number.isFinite(t2))continue;
    if(absTime>=t1&&absTime<=t2)return l.type||null;
  }
  return null;
}

/**
 * Two polar histograms — heading relative to wind (15° bins) with avg/max VMG (kt) within mark-split legs only.
 * Upwind rows: VMG toward wind (SOG×cos TWA vs wind-from). Downwind: progress away (−that component).
 */
function radarDualVmgBinsByWindHeading(analysis,windFromDeg){
  const mkBuckets=()=>{const ab={};for(let i=0;i<360;i+=15)ab[i]=[];return ab;};
  const upAb=mkBuckets(), dnAb=mkBuckets();
  let nUp=0,nDn=0;
  const pts=analysis?.points;
  if(pts?.length){
    const wd=windFromDeg;
    for(const p of pts){
      const s=ms2k(p.ss||0);
      if(s<0.5)continue;
      const lt=legTypeAtAbsTime(analysis,p.time);
      if(lt!=="upwind"&&lt!=="downwind")continue;
      const vw=vmgToWindKts(s,p.cog,wd);
      if(vw==null||!Number.isFinite(vw))continue;
      const vm=lt==="downwind"?-vw:vw;
      const rH=((p.cog-wd+360)%360);
      const bk=Math.round(rH/15)*15%360;
      const bag=(lt==="upwind"?upAb:dnAb)[bk];
      if(bag){
        bag.push(vm);
        lt==="upwind"?nUp++:nDn++;
      }
    }
  }
  const pack=(ab)=>({
    series:(()=>{
      const pd=[];
      for(let k=0;k<360;k+=15){
        const v=ab[k];
        const n=v.length;
        pd.push({label:`${k}°`,avg:n?v.reduce((s,x)=>s+x,0)/n:0,max:n?Math.max(...v):0,n});
      }
      return pd;
    })(),
  });
  return{up:{...pack(upAb),sampleCount:nUp},down:{...pack(dnAb),sampleCount:nDn}};
}

/** COG (°) at absolute time — linear blend on sin/cos for angle correctness. */
function cogDegAtTime(pts,tAbs){
  if(!pts?.length||!Number.isFinite(tAbs))return null;
  if(tAbs<=pts[0].time)return Number(pts[0].cog);
  if(tAbs>=pts[pts.length-1].time)return Number(pts[pts.length-1].cog);
  for(let i=1;i<pts.length;i++){
    if(tAbs<=pts[i].time){
      const a=pts[i-1],b=pts[i];
      const u=(tAbs-a.time)/Math.max(1e-6,b.time-a.time),s0=Math.sin(Number(a.cog)*D),c0=Math.cos(Number(a.cog)*D);
      const s1=Math.sin(Number(b.cog)*D),c1=Math.cos(Number(b.cog)*D);
      const s=s0+u*(s1-s0),c=c0+u*(c1-c0);
      return((Math.atan2(s,c)/D)+360)%360;
    }
  }
  return null;
}

/** Time-weighted mean and σ of SOG (kts) on [tStart, tEnd] (interpolated between samples). */
function speedMeanStdInInterval(pts,tStart,tEnd){
  if(!pts?.length||!(tEnd>tStart))return{mean:null,std:null,weight:0};
  let sumW=0,sumV=0,sumV2=0;
  for(let i=1;i<pts.length;i++){
    const a=pts[i-1],b=pts[i];
    if(b.time<=tStart||a.time>=tEnd)continue;
    const seg0=Math.max(a.time,tStart),seg1=Math.min(b.time,tEnd);
    if(seg1<=seg0)continue;
    const w=seg1-seg0;
    const v0=speedKtsAtTime(pts,seg0),v1=speedKtsAtTime(pts,seg1);
    if(v0==null||v1==null||!Number.isFinite(v0)||!Number.isFinite(v1))continue;
    const vAvg=(v0+v1)/2;
    sumW+=w;
    sumV+=vAvg*w;
    sumV2+=vAvg*vAvg*w;
  }
  if(sumW<=0)return{mean:null,std:null,weight:0};
  const mean=sumV/sumW;
  const vari=Math.max(0,sumV2/sumW-mean*mean);
  return{mean,std:Math.sqrt(vari),weight:sumW};
}

function circularMeanDegSampled(pts,tStart,tEnd,step=0.25){
  if(!(tEnd>tStart))return null;
  let sS=0,sC=0,n=0;
  for(let t=tStart;t<tEnd-1e-9;t+=step){
    const c=cogDegAtTime(pts,t);
    if(c==null||!Number.isFinite(c))continue;
    sS+=Math.sin(c*D);sC+=Math.cos(c*D);n++;
  }
  if(!n)return null;
  return((Math.atan2(sS/n,sC/n)/D)+360)%360;
}

function meanSampleDtSecInIndexRange(pts,i0,i1){
  const a=i0|0,b=i1|0;
  if(b<=a)return null;
  let sum=0,c=0;
  for(let i=a;i<b&&i+1<pts.length;i++){
    const dt=pts[i+1].time-pts[i].time;
    if(dt>0&&dt<120){sum+=dt;c++;}
  }
  return c?sum/c:null;
}

function minSpeedGridSearch(pts,t0,t1,step=0.2){
  if(!(t1>=t0))return{min:null,at:null};
  let minV=Infinity,minT=null;
  for(let t=t0;t<=t1+1e-9;t+=step){
    const v=speedKtsAtTime(pts,t);
    if(v!=null&&Number.isFinite(v)&&v<minV){minV=v;minT=t;}
  }
  return Number.isFinite(minV)?{min:minV,at:minT}:{min:null,at:null};
}

function segmentMeanSogKtsFromPts(pts,seg){
  if(!pts?.length||!seg||seg.startIdx==null||seg.endIdx==null)return null;
  const st=segmentStats(pts,seg.startIdx|0,seg.endIdx|0);
  return st&&Number.isFinite(st.meanSOG)?st.meanSOG:null;
}

function deriveTurnBoundsForPerformance(m,pts){
  const pre=m.preSegment,post=m.postSegment;
  if(!pre||!post)return null;
  let iInit=Math.max(0,Math.min(pts.length-1,pre.endIdx|0));
  let iComplete=Math.max(0,Math.min(pts.length-1,post.startIdx|0));
  let tInit=pts[iInit].time,tComplete=pts[iComplete].time;
  if(tComplete<tInit){const sw=iInit;iInit=iComplete;iComplete=sw;tInit=pts[iInit].time;tComplete=pts[iComplete].time;}
  const tiRaw=Math.max(0,Math.min(pts.length-1,m.turnIdx??m.idx??iInit));
  let tCross=pts[tiRaw].time;
  const lo=Math.min(tInit,tComplete),hi=Math.max(tInit,tComplete);
  if(tCross<lo||tCross>hi)tCross=(lo+hi)/2;
  return{iInit,iComplete,tInit,tComplete,tCross,iCross:tiRaw};
}

const MANEUVER_LINK_GAP_SEC=15;
const MANEUVER_RECOVERY_CAP_SEC=30;
const MANEUVER_LOW_SPEED_GATE_KTS=1.5;
const MANEUVER_PERF_SCHEMA_VERSION=2;

function computeSingleManeuverPerformance(pts,m,legsForType,windFromDeg){
  const b=deriveTurnBoundsForPerformance(m,pts);
  if(!b)return null;
  let{tInit,tComplete,tCross,iInit,iComplete}=b;
  /** Initiation = course change not earlier than (T − 10 s) before COG crosses wind (or DDW for gybe). */
  const earliestInit=tCross-MANEUVER_INIT_WINDOW_BEFORE_CROSS_SEC;
  if(tInit<earliestInit){
    tInit=earliestInit;
    iInit=nearestTimeIndexInSortedGps(pts,tInit);
  }
  if(iInit>=iComplete){
    iInit=Math.max(0,iComplete-1);
    tInit=pts[iInit]?.time??tInit;
  }
  if(!(tComplete>tInit))return null;
  const entryStart=tInit-10,entryEndExclusive=tInit;
  const exitStart=tComplete,exitEnd=tComplete+10;
  const ent=speedMeanStdInInterval(pts,entryStart,entryEndExclusive-1e-6);
  const exi=speedMeanStdInInterval(pts,exitStart,exitEnd);
  const entrySpeedAvg=ent.mean!=null?+ent.mean.toFixed(3):null;
  const entrySpeedStddev=ent.std!=null?+ent.std.toFixed(4):null;
  const exitSpeedAvg=exi.mean!=null?+exi.mean.toFixed(3):null;
  const entryCogAvg=circularMeanDegSampled(pts,entryStart,entryEndExclusive-1e-6);
  const exitCogAvg=circularMeanDegSampled(pts,exitStart,exitEnd);
  const entryCogNum=entryCogAvg!=null?Math.round(entryCogAvg*10)/10:null;
  const exitCogNum=exitCogAvg!=null?Math.round(exitCogAvg*10)/10:null;
  const turnDur=Math.max(0,tComplete-tInit);
  const cogChangeIntegral=iComplete>iInit?cumulativeTurnDeg(pts,iInit,iComplete):0;
  const cogChangeDeg=entryCogAvg!=null&&exitCogAvg!=null
    ?+Math.abs(adiff(entryCogAvg,exitCogAvg)).toFixed(1)
    :+Number(cogChangeIntegral).toFixed(1);
  const turnRate=turnDur>0.05?+(cogChangeDeg/turnDur).toFixed(3):null;
  const turnMin=minSpeedGridSearch(pts,tInit,tComplete,0.2);
  const minSpeedKts=turnMin.min!=null?+turnMin.min.toFixed(3):null;
  let minSpeedTimeOffsetSec=null;
  if(turnMin.at!=null&&Number.isFinite(tCross))minSpeedTimeOffsetSec=+(turnMin.at-tCross).toFixed(2);
  const exitDip=minSpeedGridSearch(pts,tComplete+0.15,tComplete+10,0.2);
  const exitDipMinSpeedKts=exitDip.min!=null?+exitDip.min.toFixed(3):null;
  let lowSpeedGate=false;
  for(let t=tInit;t<=tComplete+1e-9;t+=0.35){
    const v=speedKtsAtTime(pts,t);
    if(v!=null&&v<MANEUVER_LOW_SPEED_GATE_KTS){lowSpeedGate=true;break;}
  }
  const sp10=speedKtsAtTime(pts,tComplete+10);
  const speedAt10secKts=sp10!=null&&Number.isFinite(sp10)?+sp10.toFixed(3):null;
  const postMean=segmentMeanSogKtsFromPts(pts,m.postSegment);
  const refSpeed=(postMean!=null&&postMean>0.2)?postMean:(entrySpeedAvg!=null&&entrySpeedAvg>0.2?entrySpeedAvg:null);
  const recoveryThreshold=refSpeed!=null?0.95*refSpeed:null;
  let timeToFullRecoverySec=null,recoveredWithinWindow=null;
  if(recoveryThreshold!=null&&recoveryThreshold>0.2&&Number.isFinite(tComplete)){
    const lim=tComplete+MANEUVER_RECOVERY_CAP_SEC;
    timeToFullRecoverySec=MANEUVER_RECOVERY_CAP_SEC;
    recoveredWithinWindow=false;
    for(let t=tComplete;t<=lim+1e-9;t+=0.25){
      const v=speedKtsAtTime(pts,t);
      if(v!=null&&v>=recoveryThreshold){
        timeToFullRecoverySec=Math.round(Math.max(0,t-tComplete));
        recoveredWithinWindow=true;
        break;
      }
    }
  }
  const speedLossKts=entrySpeedAvg!=null&&minSpeedKts!=null?+Math.max(0,entrySpeedAvg-minSpeedKts).toFixed(3):null;
  const analysisStub=legsForType&&pts?.length?{legs:legsForType,points:pts}:null;
  let legTypeAtExit=null;
  if(analysisStub)legTypeAtExit=legTypeAtAbsTime(analysisStub,tComplete+0.5);
  const meanDt=meanSampleDtSecInIndexRange(pts,Math.min(iInit,iComplete),Math.max(iInit,iComplete));
  const meanVmgWindow=
    Number.isFinite(windFromDeg)
      ?meanVmgToWindAroundCrossing(pts,tCross,windFromDeg,MANEUVER_CHART_HALF_WINDOW_SEC)
      :null;
  return{
    schema_version:MANEUVER_PERF_SCHEMA_VERSION,
    data_source:"gps_only",
    t_init:+tInit.toFixed(2),
    t_complete:+tComplete.toFixed(2),
    t_cross:+tCross.toFixed(2),
    entry_speed_avg_kts:entrySpeedAvg,
    entry_cog_avg_deg:entryCogNum,
    entry_speed_stddev_kts:entrySpeedStddev,
    turn_duration_sec:+turnDur.toFixed(2),
    cog_change_deg:cogChangeDeg,
    cog_change_integral_deg:+Number(cogChangeIntegral).toFixed(1),
    turn_rate_deg_sec:turnRate,
    turn_rate_source:(entryCogAvg!=null&&exitCogAvg!=null)?"net_entry_exit_cog":"integral_sum_fallback",
    mean_vmg_to_wind_cross_window_kts:meanVmgWindow,
    min_speed_kts:minSpeedKts,
    min_speed_time_offset_sec:minSpeedTimeOffsetSec,
    exit_dip_min_speed_kts:exitDipMinSpeedKts,
    exit_speed_avg_kts:exitSpeedAvg,
    exit_cog_avg_deg:exitCogNum,
    speed_at_10sec_kts:speedAt10secKts,
    time_to_full_recovery_sec:timeToFullRecoverySec,
    recovered_within_window:recoveredWithinWindow,
    low_speed_gate_triggered:lowSpeedGate,
    speed_loss_kts:speedLossKts,
    recovery_ref_speed_kts:refSpeed!=null?+refSpeed.toFixed(3):null,
    leg_type_at_exit:legTypeAtExit,
    turn_mean_sample_dt_sec:meanDt!=null?+meanDt.toFixed(3):null,
    is_linked:false,
    linked_sequence_id:null,
    linked_sequence_len:1,
    linked_chrono_prev:null,
    linked_chrono_next:null,
    confidence:null,
    rank_speed_loss_session:null,
    rank_recovery_sec_session:null,
    rank_turn_duration_session:null,
    outlier_speed_loss_session:null,
  };
}

function finalizeLinkageAndSessionManeuverStats(pts,legs,tacks,gybes){
  const items=[];
  tacks.forEach((t,i)=>{
    if(t.performance)items.push({ref:t,kind:"tack",arrIdx:i});
  });
  gybes.forEach((g,i)=>{
    if(g.performance)items.push({ref:g,kind:"gybe",arrIdx:i});
  });
  items.sort((a,b)=>a.ref.performance.t_init-b.ref.performance.t_init);
  items.forEach((it,ci)=>{it.ref.performance.chrono_index=ci;});
  let seqNum=0;
  for(let i=0;i<items.length;i++){
    if(i===0||items[i].ref.performance.t_init-items[i-1].ref.performance.t_complete>MANEUVER_LINK_GAP_SEC)seqNum++;
    items[i].ref.performance.linked_sequence_id=`s${seqNum}`;
  }
  const seqCounts={};
  items.forEach(it=>{
    const id=it.ref.performance.linked_sequence_id;
    seqCounts[id]=(seqCounts[id]||0)+1;
  });
  items.forEach(it=>{
    const n=seqCounts[it.ref.performance.linked_sequence_id]||1;
    it.ref.performance.linked_sequence_len=n;
    it.ref.performance.is_linked=n>1;
  });
  for(let i=0;i<items.length;i++){
    const id=items[i].ref.performance.linked_sequence_id;
    const prevSame=i>0&&items[i-1].ref.performance.linked_sequence_id===id;
    const nextSame=i+1<items.length&&items[i+1].ref.performance.linked_sequence_id===id;
    items[i].ref.performance.linked_chrono_prev=prevSame?i-1:null;
    items[i].ref.performance.linked_chrono_next=nextSame?i+1:null;
  }
  const bySeq=new Map();
  items.forEach(it=>{
    const id=it.ref.performance.linked_sequence_id,p=it.ref.performance;
    if(!bySeq.has(id))bySeq.set(id,{chrono_indices:[],speed_losses:[],turn_durs:[]});
    const o=bySeq.get(id);
    o.chrono_indices.push(p.chrono_index);
    if(Number.isFinite(p.speed_loss_kts))o.speed_losses.push(p.speed_loss_kts);
    if(Number.isFinite(p.turn_duration_sec))o.turn_durs.push(p.turn_duration_sec);
  });
  const sequences=[...bySeq.entries()].map(([linked_sequence_id,v])=>{
    const c=v.speed_losses.length;
    const td=v.turn_durs.reduce((s,x)=>s+x,0);
    const tsl=c?v.speed_losses.reduce((s,x)=>s+x,0):0;
    return{
      linked_sequence_id,
      count:v.chrono_indices.length,
      chrono_indices:v.chrono_indices,
      total_duration_sec:+td.toFixed(2),
      total_speed_loss_kts:+tsl.toFixed(3),
      avg_speed_loss_kts:c?+(tsl/c).toFixed(3):null,
    };
  });
  function rankAmong(list,key,rankKey,lowerBetter){
    const v=list.map(m=>({m,val:m.performance[key]})).filter(x=>Number.isFinite(x.val));
    v.sort((a,b)=>lowerBetter?a.val-b.val:b.val-a.val);
    v.forEach((x,r)=>{x.m.performance[rankKey]=r+1;});
  }
  function markOutliersOnType(list,key,flagField){
    const clean=list.filter(m=>!m.excludeFromStatsAndVMG&&!m.performance.is_linked&&!m.performance.low_speed_gate_triggered);
    const vals=clean.map(m=>m.performance[key]).filter(Number.isFinite);
    if(vals.length<2){
      list.forEach(m=>{if(m.performance)m.performance[flagField]=false;});
      return;
    }
    const mean=vals.reduce((a,b)=>a+b,0)/vals.length;
    const vari=vals.reduce((s,x)=>s+(x-mean)*(x-mean),0)/vals.length;
    const sd=Math.sqrt(Math.max(0,vari));
    list.forEach(m=>{
      if(!m.performance)return;
      const v=m.performance[key];
      m.performance[flagField]=Number.isFinite(v)&&sd>1e-6&&Math.abs(v-mean)>1.5*sd;
    });
  }
  const tackRankList=tacks.filter(t=>!t.excludeFromStatsAndVMG);
  const gybeRankList=gybes.filter(g=>!g.excludeFromStatsAndVMG);
  rankAmong(tackRankList,"speed_loss_kts","rank_speed_loss_session",true);
  rankAmong(tackRankList,"time_to_full_recovery_sec","rank_recovery_sec_session",true);
  rankAmong(tackRankList,"turn_duration_sec","rank_turn_duration_session",true);
  rankAmong(gybeRankList,"speed_loss_kts","rank_speed_loss_session",true);
  rankAmong(gybeRankList,"time_to_full_recovery_sec","rank_recovery_sec_session",true);
  rankAmong(gybeRankList,"turn_duration_sec","rank_turn_duration_session",true);
  markOutliersOnType(tacks,"speed_loss_kts","outlier_speed_loss_session");
  markOutliersOnType(gybes,"speed_loss_kts","outlier_speed_loss_session");
  function finalizeConfidence(m){
    const p=m.performance;
    let pen=0;
    if(p.low_speed_gate_triggered)pen+=25;
    if(p.is_linked)pen+=15;
    const es=p.entry_speed_stddev_kts||0;
    pen+=Math.min(20,es*12);
    const mdt=p.turn_mean_sample_dt_sec||0;
    if(mdt>2)pen+=15;
    else if(mdt>1)pen+=5;
    p.confidence=Math.max(0,Math.min(100,Math.round(100-pen)));
  }
  tacks.forEach(t=>{if(t.performance)finalizeConfidence(t);});
  gybes.forEach(g=>{if(g.performance)finalizeConfidence(g);});
  function sessionCohort(typeList){
    const clean=typeList.filter(m=>!m.excludeFromStatsAndVMG&&!m.performance.is_linked&&!m.performance.low_speed_gate_triggered);
    const losses=clean.map(m=>m.performance.speed_loss_kts).filter(Number.isFinite);
    const mean=losses.length?losses.reduce((a,b)=>a+b,0)/losses.length:null;
    let std=null;
    if(losses.length>=2&&mean!=null){
      const v=losses.reduce((s,x)=>s+(x-mean)*(x-mean),0)/losses.length;
      std=Math.sqrt(Math.max(0,v));
    }
    let bestIdx=null,worstIdx=null,bestLoss=Infinity,worstLoss=-Infinity;
    clean.forEach(m=>{
      const L=m.performance.speed_loss_kts;
      if(!Number.isFinite(L))return;
      const ai=typeList.indexOf(m);
      if(L<bestLoss){bestLoss=L;bestIdx=ai;}
      if(L>worstLoss){worstLoss=L;worstIdx=ai;}
    });
    const byLeg={};
    ["upwind","downwind","reach"].forEach(lt=>{
      const sub=clean.filter(m=>m.performance.leg_type_at_exit===lt);
      let bi=null,wl=null,bLv=Infinity,wLv=-Infinity;
      sub.forEach(m=>{
        const L=m.performance.speed_loss_kts;
        if(!Number.isFinite(L))return;
        const ai=typeList.indexOf(m);
        if(L<bLv){bLv=L;bi=ai;}
        if(L>wLv){wLv=L;wl=ai;}
      });
      byLeg[lt]={n:sub.length,best_array_index:bi,worst_array_index:wl};
    });
    return{
      clean_count:clean.length,
      speed_loss_mean:mean!=null?+mean.toFixed(3):null,
      speed_loss_stddev:std!=null?+std.toFixed(3):null,
      best:{array_index:bestIdx,speed_loss_kts:bestIdx!=null&&typeList[bestIdx]?typeList[bestIdx].performance.speed_loss_kts:null},
      worst:{array_index:worstIdx,speed_loss_kts:worstIdx!=null&&typeList[worstIdx]?typeList[worstIdx].performance.speed_loss_kts:null},
      by_leg_type_exit:byLeg,
    };
  }
  return{
    schema_version:MANEUVER_PERF_SCHEMA_VERSION,
    linkage_gap_sec:MANEUVER_LINK_GAP_SEC,
    recovery_cap_sec:MANEUVER_RECOVERY_CAP_SEC,
    sequences,
    session:{tack:sessionCohort(tacks),gybe:sessionCohort(gybes)},
  };
}

function runAnalysis(rawPts,userWind=null,markPositions=null,laps=1,preamble=null,detSettings=DETECTION_DEFAULTS,startFinishLine=null,windTuning=null,gpsToBowM=2,windwardMarkName=null,committeeLineInject=null){
  if(!rawPts||rawPts.length<20)return null;
  const sorted=[...rawPts].sort((a,b)=>a.time-b.time);
  const deduped=sorted.filter((p,i)=>i===0||p.time!==sorted[i-1].time);
  const en=enrich(deduped);
  const sogArr=sm(en.map(p=>p.sog),7);
  en.forEach((p,i)=>{p.ss=sogArr[i]});

  const speeds=en.map(p=>ms2k(p.ss)).filter(s=>s>0.3);
  const maxSpeed=speeds.length?Math.max(...speeds):0;
  const avgSpeed=speeds.length?speeds.reduce((a,b)=>a+b,0)/speeds.length:0;
  const totalDist=en.reduce((a,p)=>a+(p.dist||0),0);
  const duration=en[en.length-1].time-en[0].time;

  const{stableSegments,manoeuvres:segMans}=detectMans(en);
  const earlyMans=detectEarlyMicroManoeuvres(en);
  const manoeuvres=mergeManoeuvresByTime(segMans,earlyMans);
  const windDerive=deriveWindAndClassify(manoeuvres,stableSegments,userWind,en,windTuning);
  const wd=windDerive.windDir;
  const windEst=windDerive.windEst;
  const manoeuvreEvents=applyDetectionSettings(manoeuvres,en,detSettings);
  const markLocList=allCourseMarkLocations(markPositions,preamble,laps);
  const legDetection=detectLegsFromMarks(en,markPositions||[],laps,preamble,startFinishLine,gpsToBowM,wd,windwardMarkName,committeeLineInject);
  const legDiagnostics={markSequence:legDetection.markSequenceLog||[],legBuild:legDetection.legBuildLog||[]};
  const roundingIdxs=legDetection?.roundings?.map(r=>r.idx).filter(i=>Number.isFinite(i)&&i>=0)??[];
  for(const m of manoeuvreEvents){
    const ti=Math.max(0,Math.min(en.length-1,m.turnIdx??m.idx));
    const nm=minDistManoeuvreWindowToCourseMarksM(en,m,detSettings,markLocList);
    m.nearestMarkDistM=nm.dist;
    m.nearestMarkName=nm.name;
    const excludeMarkRadius=Number.isFinite(nm.dist)&&nm.dist<=MARK_MANOEUVRE_AT_MARK_M;
    const excludeInMarkRounding=(legDetection?.roundings||[]).some(r=>{
      if(!r||r.mark==="START"||r.mark==="FINISH")return false;
      if(r.roundingGateOK&&r.entryIdx!=null&&r.exitIdx!=null&&r.exitIdx>=r.entryIdx)
        return ti>=r.entryIdx&&ti<=r.exitIdx;
      return false;
    });
    const excludeNearRoundingIdx=!excludeInMarkRounding&&roundingIdxs.length>0&&roundingIdxs.some(ri=>Math.abs(ti-ri)<=MARK_MANOEUVRE_NEAR_ROUNDING_PTS);
    m.excludeMarkRadius=excludeMarkRadius;
    m.excludeNearRoundingIdx=excludeNearRoundingIdx;
    m.excludeFromStatsAndVMG=excludeMarkRadius||excludeInMarkRounding||excludeNearRoundingIdx;
  }
  const baselines=buildBaselines(stableSegments,windDerive.meanPortCOG,windDerive.meanStarboardCOG,windDerive.tackAngle,wd);
  const windBuild=buildWindTrace(stableSegments,baselines,en[0].time,en[en.length-1].time);
  const windTrace=windBuild.windTrace;
  const windStats=windBuild.windStats;

  const tacks=manoeuvreEvents.filter(m=>m.type==="tack").map(m=>{
    const perf=scoreTackManoeuvre(m,en,baselines,windTrace,wd);
    const pt=en[m.turnIdx??m.idx];
    return{
      ...m,
      preS:m.preRefSpeed??m.preSpeed??0,
      lat:pt.lat,lon:pt.lon,
      q:null,
      rt:perf.speedRecovery,
      minS:Math.min(...perf.speedProfile.filter(p=>p.t>=0&&p.t<=10).map(p=>p.speed),m.preRefSpeed||m.preSpeed||0),
      prof:perf.speedProfile,
      exitBias:perf.exitBias,
      exitBiasAmount:perf.exitBiasAmount,
      vmgCost:perf.vmgCost,
      headingConvergence:perf.headingConvergence,
    };
  });
  const gybes=manoeuvreEvents.filter(m=>m.type==="gybe").map(m=>{
    const pt=en[m.turnIdx??m.idx];
    return{
      ...m,
      q:Math.max(0,Math.round(100-Math.max(0,m.gapDuration-4)*4)),
      rt:Math.round(Math.min(30,m.gapDuration+4)),
      preS:m.preRefSpeed??m.preSpeed??0,
      minS:Math.max(0,(m.preRefSpeed??m.preSpeed??0)-1.2),
      prof:speedProfile(en,m.idx),
      lat:pt.lat,lon:pt.lon,
    };
  });

  let legs=[],markRoundingDetailsAll=[];
  if(legDetection){
    const{legs:rawLegs,roundings}=legDetection;
    legs=classifyLegs(rawLegs,wd,manoeuvreEvents.filter(m=>m.type==="gybe"));
    markRoundingDetailsAll=analyzeMarkRoundingDetails(en,roundings,manoeuvreEvents);
    const detailList=markRoundingDetailsAll.filter(d=>!d.skipped);
    for(const tk of tacks){
      const d=findBestMarkRoundingDetail(tk,detailList);
      const ctx=buildMarkRoundingContext(en,tk,d);
      if(ctx)tk.markRounding=ctx;
    }
    for(const g of gybes){
      const d=findBestMarkRoundingDetail(g,detailList);
      const ctx=buildMarkRoundingContext(en,g,d);
      if(ctx)g.markRounding=ctx;
    }
  }

  const markDetForMask=markRoundingDetailsAll.filter(d=>!d.skipped);
  const roundingPointMask=computeRoundingPointMask(en,markDetForMask,baselines);
  const trackSegmentFC=legDiagnostics?.legBuild?.length
    ? buildTrackSegmentFeatureCollectionWithLegDiagnostics(en,legDiagnostics.legBuild,roundingPointMask)
    : buildTrackSegmentFeatureCollection(en,roundingPointMask);

  const hasMansForVMG=manoeuvreEvents.some(m=>!m.excludeFromStatsAndVMG);
  const vmcMode=hasMansForVMG?"magnitude":"targeted";
  const vmgMode=vmcMode;

  legs=legs.map(l=>{
    const courseBrg=Number.isFinite(l.markChordBearingDeg)?l.markChordBearingDeg:l.legBearing;
    const sampleLegVmcs=(skipRounding)=>{
      const out=[];
      for(let i=l.startIdx;i<=l.endIdx&&i<en.length;i++){
        if(skipRounding&&roundingPointMask[i])continue;
        const p=en[i];
        const signed=vmcToMarkBearingKts(ms2k(p.ss||0),p.cog,courseBrg);
        if(signed==null||!Number.isFinite(signed))continue;
        out.push(vmcMode==="magnitude"?Math.abs(signed):signed);
      }
      return out;
    };
    let vmcs=sampleLegVmcs(true);
    if(!vmcs.length)vmcs=sampleLegVmcs(false);
    const avgVmc=vmcs.length?vmcs.reduce((a,b)=>a+b,0)/vmcs.length:null;
    const sampleLegVmgToWind=(skipRounding)=>{
      const vmgs=[],wts=[];
      for(let i=l.startIdx;i<=l.endIdx&&i<en.length;i++){
        if(skipRounding&&roundingPointMask[i])continue;
        const p=en[i];
        const s=ms2k(p.ss||0);
        if(s<0.3)continue;
        const v=vmgToWindKts(s,p.cog,wd);
        if(v==null||!Number.isFinite(v))continue;
        vmgs.push(v);
        wts.push(pointTimeWeightSec(en,i));
      }
      if(!vmgs.length)return null;
      const wSum=wts.reduce((a,b)=>a+b,0);
      return wSum>0?vmgs.reduce((s,v,j)=>s+v*wts[j],0)/wSum:vmgs.reduce((a,b)=>a+b,0)/vmgs.length;
    };
    let avgVmgToWind=sampleLegVmgToWind(true);
    if(avgVmgToWind==null||!Number.isFinite(avgVmgToWind))avgVmgToWind=sampleLegVmgToWind(false);
    const durSec=l.duration>0?l.duration:(l.endIdx!=null&&l.startIdx!=null&&en[l.endIdx]&&en[l.startIdx])
      ?en[l.endIdx].time-en[l.startIdx].time:0;
    let chordProgressKts=null;
    if(Number.isFinite(l.markChordM)&&l.markChordM>0&&durSec>0)chordProgressKts=(m2nm(l.markChordM)*3600)/durSec;
    return{...l,avgVmc,avgVmgToWind,avgVMG:avgVmgToWind,chordProgressKts,vmcChordBearingDeg:Number.isFinite(courseBrg)?Math.round(courseBrg):null};
  });

  tacks.forEach(t=>{
    const perf=computeSingleManeuverPerformance(en,t,legs,wd);
    if(perf){
      t.performance=perf;
      t.perfChart=buildManeuverWindowChartSeries(en,perf,wd);
    }
  });
  gybes.forEach(g=>{
    const perf=computeSingleManeuverPerformance(en,g,legs,wd);
    if(perf){
      g.performance=perf;
      g.perfChart=buildManeuverWindowChartSeries(en,perf,wd);
    }
  });
  tacks.forEach(t=>applyTackVmgQualityVsUpwindRef(en,t,wd,legs,roundingPointMask));
  const maneuverPerformance=finalizeLinkageAndSessionManeuverStats(en,legs,tacks,gybes);

  const streaks={};
  [2,3,4,5,6].forEach(th=>{let lo=0,cu=0;en.forEach(p=>{if(ms2k(p.ss)>=th){cu++;if(cu>lo)lo=cu}else cu=0});streaks[th]=lo});

  const maxSpeedMark=computeMaxSpeedHighlight(en,legs,wd);
  const speedTL=buildSpeedTimeSeries(en,maxSpeedMark);

  let portS=0,stbdS=0;
  en.forEach(p=>{if(ms2k(p.ss)<0.5)return;const r=((p.cog-wd+360)%360);if(r>180)stbdS++;else portS++});

  const upwindByTack=computeTackLegStatsByType(en,legs,wd,"upwind",roundingPointMask);
  const reachByTack=computeTackLegStatsByType(en,legs,wd,"reach",roundingPointMask);
  const downwindByTack=computeTackLegStatsByType(en,legs,wd,"downwind",roundingPointMask);
  const tackStatsByLegType={
    upwind:tackStatsForCompareStore(upwindByTack),
    reach:tackStatsForCompareStore(reachByTack),
    downwind:tackStatsForCompareStore(downwindByTack),
  };
  const tacksStats=tacks.filter(t=>!t.excludeFromStatsAndVMG);
  const gybesStats=gybes.filter(g=>!g.excludeFromStatsAndVMG);
  const soloTackScores=tacksStats.filter(t=>t.q!=null).map(t=>t.q);
  const avgTackQuality=soloTackScores.length?soloTackScores.reduce((a,b)=>a+b,0)/soloTackScores.length:null;
  const avgGybeQuality=gybesStats.length?gybesStats.reduce((a,b)=>a+(Number(b.q)||0),0)/gybesStats.length:null;

  const cropFingerprint=en.length>=2?`${en[0].time}|${en[en.length-1].time}|${en.length}`:null;
  return{
    points:en,
    cropFingerprint,
    windDir:wd,
    courseGeometrySignature:courseGeometrySignature(preamble,markPositions,laps,startFinishLine),
    legGatesWindwardMark:(windwardMarkName==null||windwardMarkName==="")?null:String(windwardMarkName).trim(),
    windEst,
    windTrace,
    windStats,
    vmgMode,
    detSettings,
    gpsToBowM,
    stableSegments,
    baselines,
    stats:{
      totalDist,duration,maxSpeed,avgSpeed,
      tackCount:tacksStats.length,gybeCount:gybesStats.length,
      tackCountAll:tacks.length,gybeCountAll:gybes.length,
      tackCountMarkAdjacent:tacks.length-tacksStats.length,
      gybeCountMarkAdjacent:gybes.length-gybesStats.length,
      avgTackQuality,avgGybeQuality,
      windShiftRange:windStats.range,
      portStbdSplit:{port:portS,stbd:stbdS},
      tackStatsByLegType,
      maneuverPerformance,
    },
    tacks,gybes,legs,legDiagnostics,
    markRoundingDetails:markRoundingDetailsAll.filter(d=>!d.skipped),
    trackSegmentFC,
    streaks,speedTL,portS,stbdS,upwindByTack,maxSpeedMark,
  };
}
export {
  runAnalysis,
  parseGPX,
  parseFIT,
  enrich,
  detectMans,
  DETECTION_DEFAULTS,
  DEFAULT_SF_LINE_ENDS,
  WSC_MARKS,
  WSC_COURSES,
  cropTrackPoints,
  parseHMS,
  formatHMS,
  destinationPoint,
  hav,
  bear,
  ms2k,
  m2nm,
  allCourseMarkLocations,
  detectLegsFromMarks,
  customCourseMarkRowsFromRecipe,
  normalizeCustomCourseRecipe,
  buildOneSidedGateFC,
  buildMarkGateDebugFC,
  buildTrackSegmentFeatureCollection,
  buildAllTacksVmgOverlayData,
  mapboxTrackLineColorByKindExpr,
  manoeuvreBadgeBaseColor,
  courseGeometrySignature,
  TRACK_LEG_SEGMENT_PALETTE,
  TRACK_LEG_SKIP_COLOR,
  MAP_RND_BISECTOR_LINE,
};
