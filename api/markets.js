export default async function handler(req, res) {
  try {
    const base = 'https://api1.tabdeal.org';
    const r = await fetch(base + '/r/api/v1/exchangeInfo/', { headers: { accept: 'application/json', 'user-agent': 'TabdealDashboard/1.0' } });
    if (!r.ok) return res.status(r.status).json({ error: `Tabdeal exchangeInfo ${r.status}` });
    const raw = await r.json();
    const list = Array.isArray(raw) ? raw : (raw.data || raw.symbols || []);
    const markets = list.filter(x => !x.status || x.status === 'TRADING').map(x => ({
      symbol: x.symbol || '', baseAsset: x.baseAsset || '', quoteAsset: x.quoteAsset || '', tabdealSymbol: x.tabdealSymbol || x.symbol || ''
    }));
    const now = Math.floor(Date.now()/1000), from = now - 86400;
    const result = [];
    for (let i=0; i<Math.min(markets.length, 80); i+=8) {
      const batch = markets.slice(i,i+8);
      const rows = await Promise.all(batch.map(async m => {
        try {
          const u = `${base}/r/plots/history/?symbol=${encodeURIComponent(m.tabdealSymbol)}&resolution=60&from=${from}&to=${now}`;
          const rr = await fetch(u, { headers: { accept:'application/json', 'user-agent':'TabdealDashboard/1.0' } });
          if (!rr.ok) return {...m,price:null,changePct:null,high24:null,low24:null,quoteVolume24:null,spark:[]};
          const j=await rr.json(); const c=Array.isArray(j?.data)?j.data:[];
          const close=v=>Array.isArray(v)?Number(v[4]):Number(v.close), high=v=>Array.isArray(v)?Number(v[2]):Number(v.high), low=v=>Array.isArray(v)?Number(v[3]):Number(v.low), vol=v=>Array.isArray(v)?Number(v[5]):Number(v.volume);
          if(!c.length) return {...m,price:null,changePct:null,high24:null,low24:null,quoteVolume24:null,spark:[]};
          const first=close(c[0]), last=close(c[c.length-1]); const volume=c.reduce((s,v)=>s+(Number.isFinite(vol(v))?vol(v):0),0);
          return {...m,price:Number.isFinite(last)?last:null,changePct:first?((last-first)/first)*100:null,high24:Math.max(...c.map(high).filter(Number.isFinite)),low24:Math.min(...c.map(low).filter(Number.isFinite)),quoteVolume24:volume*(Number.isFinite(last)?last:0),spark:c.map(close).filter(Number.isFinite)};
        } catch { return {...m,price:null,changePct:null,high24:null,low24:null,quoteVolume24:null,spark:[]}; }
      })); result.push(...rows);
    }
    res.setHeader('Cache-Control','s-maxage=20, stale-while-revalidate=60');
    return res.status(200).json(result);
  } catch (e) { return res.status(500).json({error:String(e?.message||e)}); }
}
