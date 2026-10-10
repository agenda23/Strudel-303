/**
 * Octave-band energy profile of the 303 voice playing a fixed acid line, for comparing filter
 * models/settings objectively (tpt vs diode, drive, asymmetry). Run: npx tsx tools/band-profile.ts
 */
import { TB303Voice } from '../src/dsp/tb303';
const SR=44100; const step=60/136/4;
const notes=[33,33,45,33,33,40,33,45,33,33,45,33,38,40,33,43]; const acc=[1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,0];
function fft(re:Float64Array,im:Float64Array){const n=re.length;for(let i=1,j=0;i<n;i++){let b=n>>1;for(;j&b;b>>=1)j^=b;j^=b;if(i<j){[re[i],re[j]]=[re[j],re[i]];[im[i],im[j]]=[im[j],im[i]];}}for(let len=2;len<=n;len<<=1){const a=-2*Math.PI/len;for(let i=0;i<n;i+=len)for(let k=0;k<len/2;k++){const wr=Math.cos(a*k),wi=Math.sin(a*k);const ur=re[i+k],ui=im[i+k];const xr=re[i+k+len/2],xi=im[i+k+len/2];const vr=xr*wr-xi*wi,vi=xr*wi+xi*wr;re[i+k]=ur+vr;im[i+k]=ui+vi;re[i+k+len/2]=ur-vr;im[i+k+len/2]=ui-vi;}}}
const EDGES=[0,100,200,400,800,1600,3200,6400,22050];
export function run(params:any, cut=600, res=0.88){ const v:any=new TB303Voice(); Object.assign(v.params,{cutoff:cut,resonance:res,envMod:0.8,decay:0.2,...params});
 const out:number[]=[]; for(let loop=0;loop<3;loop++) for(let s=0;s<16;s++){ v.triggerNote(440*Math.pow(2,(notes[s]-69)/12),!!acc[s],false,step*0.5,SR); for(let i=0;i<step*SR;i++){const y=v.process(SR); if(loop>=1) out.push(y);} }
 const N=4096; const bands=new Array(EDGES.length-1).fill(0); let tot=0; let pk=0, sum=0;
 for(const y of out){pk=Math.max(pk,Math.abs(y)); sum+=y*y}
 for(let st=0;st+N<=out.length;st+=N){const re=new Float64Array(N),im=new Float64Array(N);for(let i=0;i<N;i++)re[i]=out[st+i]*(0.5-0.5*Math.cos(2*Math.PI*i/N));fft(re,im);for(let k=1;k<N/2;k++){const f=k*SR/N;const p=re[k]**2+im[k]**2;tot+=p;const b=EDGES.findIndex((e,i)=>i>0&&f<e)-1;bands[b]+=p;}}
 return {bands:bands.map(b=>10*Math.log10(b/tot+1e-12)), rms:Math.sqrt(sum/out.length), pk};
}
if (process.argv[1].endsWith("band-profile.ts")) {
 console.log('band energy share (dB re total): ', EDGES.slice(0,-1).map((e,i)=>`${e}-${EDGES[i+1]}`).join(' | '));
 for (const [name,p] of [['tpt d0',{filterModel:'tpt',filterDrive:0}],['diode d.3',{filterModel:'diode',filterDrive:0.3}],['diode d0',{filterModel:'diode',filterDrive:0}],['diode d.7',{filterModel:'diode',filterDrive:0.7}]] as const){ const r=run(p); console.log(name.padEnd(10), r.bands.map(b=>b.toFixed(1).padStart(6)).join(' '),' rms',r.rms.toFixed(3),'peak',r.pk.toFixed(2)); }
}
