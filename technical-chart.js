/* Selected-stock chart presentation. No chart state participates in decisions. */
(function createTechnicalChart(root) {
  "use strict";
  let active = null, libraryPromise = null, created = 0, removed = 0;
  const palette = ["#54c8e8", "#ac9df3", "#e3bb71", "#ee8eac", "#8ab9db"];
  const finite = value => typeof value === "number" && Number.isFinite(value);
  const escape = value => String(value ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const preferences = {daily:{range:126,oscillator:"macd"},weekly:{range:104,oscillator:"macd"}};
  const layers = {ma:true,structure:true,zones:true,fib:false,bb:false,history:false,fvg:false};
  function loadLibrary() {
    if (root.LightweightCharts) return Promise.resolve(root.LightweightCharts);
    if (!libraryPromise) libraryPromise = new Promise((resolve,reject)=>{
      const script=document.createElement("script");script.src="./vendor/lightweight-charts.js?v=5.2.0";script.async=true;
      script.onload=()=>root.LightweightCharts?resolve(root.LightweightCharts):reject(new Error("Chart unavailable"));
      script.onerror=()=>{script.remove();reject(new Error("Chart unavailable"));};document.head.append(script);
    }).catch(error=>{libraryPromise=null;throw error;});
    return libraryPromise;
  }
  function destroy() {
    if (!active) return;
    const old=active;active=null;old.disposed=true;
    old.observer?.disconnect();old.markers?.detach();
    if (old.chart) {old.chart.remove();removed+=1;}
    old.host?.removeEventListener("click",old.click);
    old.host?.removeEventListener("change",old.change);
    const canvas=old.host?.querySelector("[data-chart-canvas]");
    if(canvas){canvas.onpointerup=null;canvas.onwheel=null;}
    old.model=null;old.series=[];old.chart=null;old.markers=null;old.observer=null;
    old.candles=null;old.paint=null;old.click=null;old.change=null;old.options=null;
  }
  function markup(language="en",horizon="daily") {
    const zh=language==="zh",t=(en,cn)=>zh?cn:en,pref=preferences[horizon];
    const options=[["ma","Moving averages","均线"],["structure","Structure","结构"],["zones","Zones / risk","区间／风险"],["fib","Fibonacci","斐波那契"],["bb","Bollinger","布林带"],["history","52W / history","52周／历史"],["fvg","FVG · shadow","FVG · 影子"]];
    return `<section class="technical-chart-card" data-chart-host>
      <div class="chart-toolbar"><div class="chart-layers" role="group" aria-label="${t("Chart layers","图层")}">${options.map(([key,en,cn])=>`<button type="button" data-chart-layer="${key}" aria-pressed="${layers[key]}">${escape(t(en,cn))}</button>`).join("")}</div>
      <label class="chart-oscillator-label">${t("Indicator","副图")} <select data-chart-oscillator aria-label="${t("Indicator pane","指标副图")}">${["macd","rsi","adx","kdj","obv","atr","squeeze","none"].map(key=>`<option value="${key}"${key===pref.oscillator?" selected":""}>${key==="none"?t("Hide","收起"):key.toUpperCase()}</option>`).join("")}</select></label></div>
      <div class="chart-readout" data-chart-readout aria-live="off"></div><div class="chart-line-key" data-chart-key></div>
      <div class="chart-stage"><div class="chart-canvas" data-chart-canvas role="img" aria-label="${t("Completed candlesticks, volume and selected indicator. Values are also available in the table below.","完成周期K线、成交量和所选指标；下方提供对应数据表。")}"></div><div class="chart-overlays" data-chart-overlays aria-hidden="true"></div><p class="chart-message" data-chart-message role="status">${t("Loading chart…","正在加载走势图…")}</p></div>
      <div class="chart-footer"><div class="chart-ranges" role="group" aria-label="${t("Visible range","显示范围")}">${(horizon==="weekly"?[[26,"6M","6月"],[52,"1Y","1年"],[104,"2Y","2年"],[0,"Loaded","已载入"]]:[[63,"3M","3月"],[126,"6M","6月"],[252,"1Y","1年"],[0,"Loaded","已载入"]]).map(([n,en,cn])=>`<button type="button" data-chart-range="${n}" aria-pressed="${pref.range===n}">${t(en,cn)}</button>`).join("")}</div><div class="chart-navigation"><button type="button" data-chart-nav="left" aria-label="${t("Pan left","向左移动")}">←</button><button type="button" data-chart-nav="right" aria-label="${t("Pan right","向右移动")}">→</button><button type="button" data-chart-nav="in" aria-label="${t("Zoom in","放大")}">＋</button><button type="button" data-chart-nav="out" aria-label="${t("Zoom out","缩小")}">−</button><button type="button" data-chart-fit aria-pressed="${Boolean(pref.fit)}" title="${t("Include all current zones and risk boundaries in the price scale","价格轴包含全部当前区间与风险边界")}">${t("Fit zones","全区间")}</button></div><a class="chart-attribution" href="https://www.tradingview.com/lightweight-charts/" target="_blank" rel="noopener noreferrer">TradingView Lightweight Charts™</a></div>
      <p class="chart-context" data-chart-context></p><details class="technical-advanced chart-data-table"><summary>${t("Latest 10 completed bars · data table","最近10根完成K线 · 数据表")}</summary><div data-chart-table></div></details>
    </section>`;
  }
  async function mount(host,options) {
    destroy();if (!host) return;
    const owner={host,options,disposed:false,series:[]};active=owner;
    const zh=options.language==="zh",t=(en,cn)=>zh?cn:en;
    const query=selector=>host.querySelector(selector),message=query("[data-chart-message]");
    try {
      const lib=await loadLibrary();if(owner.disposed || active!==owner || !host.isConnected) return;
      owner.lib=lib;
      const pref=preferences[options.horizon];
      owner.model=root.CanonicalTechnicalFeatures.buildChartData({history:options.history,features:options.features,horizon:options.horizon,oscillator:pref.oscillator});
      if (!owner.model.candles.length) {message.textContent=t("No verified completed bars for this frame.","该周期没有可核验的完成K线。");host.dataset.chartReady="empty";host.querySelectorAll("button,select").forEach(control=>{control.disabled=true;});return;}
      owner.paint=()=>draw(owner);
      owner.click=event=>{
        const layer=event.target.closest("[data-chart-layer]");
        if(layer) {const key=layer.dataset.chartLayer;layers[key]=!layers[key];layer.setAttribute("aria-pressed",String(layers[key]));owner.paint();return;}
        const range=event.target.closest("[data-chart-range]");
        if(range) {pref.range=Number(range.dataset.chartRange);host.querySelectorAll("[data-chart-range]").forEach(b=>b.setAttribute("aria-pressed",String(Number(b.dataset.chartRange)===pref.range)));setRange(owner);return;}
        const fit=event.target.closest("[data-chart-fit]");if(fit){pref.fit=!pref.fit;fit.setAttribute("aria-pressed",String(pref.fit));owner.paint();return;}
        const nav=event.target.closest("[data-chart-nav]");if(!nav || !owner.chart) return;
        const r=owner.chart.timeScale().getVisibleLogicalRange();if(!r)return;
        const width=r.to-r.from,code=nav.dataset.chartNav;
        const shift=code==="left"?-width*.25:code==="right"?width*.25:0;
        const inset=code==="in"?width*.15:code==="out"?-width*.15:0;
        owner.chart.timeScale().setVisibleLogicalRange({from:r.from+shift+inset,to:r.to+shift-inset});
      };
      owner.change=event=>{if(!event.target.matches("[data-chart-oscillator]"))return;pref.oscillator=event.target.value;owner.model=root.CanonicalTechnicalFeatures.buildChartData({history:options.history,features:options.features,horizon:options.horizon,oscillator:pref.oscillator});owner.paint();};
      host.addEventListener("click",owner.click);host.addEventListener("change",owner.change);
      owner.paint();message.hidden=true;host.dataset.chartReady="true";
    } catch(error) {
      if(!owner.disposed) {message.hidden=false;message.textContent=t("Chart unavailable. Technical values and decisions remain below.","走势图暂不可用；下方技术数据和决策仍可查看。");host.dataset.chartReady="error";}
    }
  }
  function setRange(owner) {
    const n=owner.model.candles.length,count=preferences[owner.options.horizon].range || n;
    owner.chart.timeScale().setVisibleLogicalRange({from:Math.max(0,n-count),to:n+6});
  }
  function draw(owner) {
    const {host,options,model,lib}=owner,zh=options.language==="zh",t=(en,cn)=>zh?cn:en,pref=preferences[options.horizon];
    const q=selector=>host.querySelector(selector),canvas=q("[data-chart-canvas]"),overlays=q("[data-chart-overlays]");
    const previous=owner.chart?.timeScale().getVisibleLogicalRange();
    owner.observer?.disconnect();owner.markers?.detach();if(owner.chart){owner.chart.remove();removed+=1;}
    owner.series=[];overlays.replaceChildren();
    const mobile=host.clientWidth<600,hasOsc=pref.oscillator!=="none";
    const chart=lib.createChart(canvas,{height:mobile?(hasOsc?440:340):(hasOsc?560:450),width:Math.max(240,canvas.clientWidth),
      layout:{background:{type:"solid",color:"#0c1522"},textColor:"#97acc4",fontFamily:'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',fontSize:11,attributionLogo:false,panes:{separatorColor:"#263449",separatorHoverColor:"#445877",enableResize:true}},
      grid:{vertLines:{color:"#192536"},horzLines:{color:"#192536"}},rightPriceScale:{borderColor:"#29374a",minimumWidth:66},timeScale:{borderColor:"#29374a",rightOffset:6,minBarSpacing:1},
      crosshair:{mode:lib.CrosshairMode.Normal},handleScroll:{mouseWheel:false,pressedMouseMove:true,horzTouchDrag:true,vertTouchDrag:false},handleScale:{mouseWheel:true,pinch:true,axisPressedMouseMove:true},localization:{locale:zh?"zh-CN":"en-US"}});
    owner.chart=chart;created+=1;
    const add=(type,data,config={},pane=0)=>{const s=chart.addSeries(type,config,pane);s.setData(data);owner.series.push(s);return s;};
    const candles=add(lib.CandlestickSeries,model.candles,{upColor:"#36b991",downColor:"#e27985",borderVisible:false,wickUpColor:"#36b991",wickDownColor:"#e27985",priceLineVisible:false,autoscaleInfoProvider:original=>{
      const info=original();if(!pref.fit || !info?.priceRange)return info;
      const p=options.decision?.priceLandscape || {},v=[options.quotePrice,p.opportunityRange?.low,p.opportunityRange?.high,p.reduceRange?.low,p.reduceRange?.high,p.invalidation,p.hardInvalidation,p.shortEntryRange?.low,p.shortEntryRange?.high,p.shortInvalidation].filter(x=>finite(x)&&x>0);
      return {...info,priceRange:{minValue:Math.min(info.priceRange.minValue,...v),maxValue:Math.max(info.priceRange.maxValue,...v)}};
    }});
    owner.candles=candles;
    const key=[];
    model.lines.filter(line=>layers[line.kind]).forEach((line,i)=>{
      const color=line.kind==="bb"?"#7889a9":palette[i%palette.length];
      add(lib.LineSeries,line.data,{color,lineWidth:line.kind==="bb"?1:2,lastValueVisible:false,priceLineVisible:false,crosshairMarkerVisible:false});key.push({name:line.name,color,value:line.data.at(-1)?.value});
    });
    add(lib.HistogramSeries,model.volume,{priceFormat:{type:"volume"},priceLineVisible:false,lastValueVisible:false},1);
    add(lib.LineSeries,model.volumeAverage,{color:"#bc9ce9",lineWidth:1,priceLineVisible:false,lastValueVisible:false},1);
    if(hasOsc) model.oscillator.forEach((line,i)=>{
      const color=palette[i%palette.length];
      const data=line.histogram?line.data.map(p=>finite(p.value)?{...p,color:p.value>=0?"#36b991":"#e27985"}:p):line.data;
      const sub=add(line.histogram?lib.HistogramSeries:lib.LineSeries,data,{color,lineWidth:1,priceLineVisible:false,lastValueVisible:false},2);
      if(pref.oscillator==="rsi" && i===0) for(const price of [30,70]) sub.createPriceLine({price,color:"#65748c",lineWidth:1,lineStyle:2,axisLabelVisible:false,title:""});
    });
    chart.panes()[0].setStretchFactor(5);chart.panes()[1].setStretchFactor(1);
    if(hasOsc)chart.panes()[2].setStretchFactor(1.5);
    const number=value=>finite(value)?value.toLocaleString(zh?"zh-CN":"en-US",{maximumFractionDigits:3}):"—";
    const volume=value=>finite(value)?new Intl.NumberFormat(zh?"zh-CN":"en-US",{notation:"compact",maximumFractionDigits:2}).format(value):"—";
    const readout=index=>{
      const bar=model.candles[index],vol=model.volume[index];if(!bar)return;
      q("[data-chart-readout]").innerHTML=`<time>${bar.time}</time>${[["O","开",bar.open],["H","高",bar.high],["L","低",bar.low],["C","收",bar.close]].map(([en,cn,v])=>`<span>${t(en,cn)} <b>${number(v)}</b></span>`).join("")}<span>${t("Vol","量")} <b>${volume(vol?.value)}</b></span><span>${t("Vol MA20","量MA20")} <b>${volume(model.volumeAverage[index]?.value)}</b></span><span class="chart-pane-key">${pref.oscillator!=="none"?escape(pref.oscillator.toUpperCase()):""} ${model.oscillator.map(line=>`${escape(line.name)} ${number(line.data[index]?.value)}`).join(" · ")}</span>`;
    };
    readout(model.candles.length-1);
    q("[data-chart-key]").innerHTML=key.map(item=>`<span style="--series-color:${item.color}"><i></i>${escape(item.name)} <b>${number(item.value)}</b></span>`).join("");
    const frame=options.features.horizons?.[options.horizon] || {},structure=frame.trend?.support_resistance || {},landscape=options.decision?.priceLandscape || {};
    const toIndex=stamp=>model.barEnds.findIndex(end=>Date.parse(end)>=Date.parse(stamp));
    const horizontal=(price,knownAt,color,title)=>{
      if(!finite(price))return;
      const i=toIndex(knownAt);if(i<0 || i>=model.candles.length-1)return;
      add(lib.LineSeries,[{time:model.candles[i].time,value:price},{time:model.candles.at(-1).time,value:price}],{color,lineWidth:1,lineStyle:2,lastValueVisible:false,priceLineVisible:false,crosshairMarkerVisible:false,autoscaleInfoProvider:()=>null});
    };
    if(layers.structure){
      (structure.levels || []).filter(level=>level.active && level.role_confirmed).forEach(level=>horizontal(level.price,level.role_known_at || level.known_at,level.role==="support"?"#36b99188":"#e2798588"));
      const smc=frame.trend?.smc || {},events=[...(structure.events || []),...(smc.sweeps || []),smc.last_bos,smc.last_choch].filter(Boolean);
      const unique=new Map();events.forEach(event=>{const i=toIndex(event.timestamp);if(i<0)return;const kind=event.kind || "Sweep";unique.set(`${i}:${kind}`,{time:model.candles[i].time,position:event.sign>0?"belowBar":"aboveBar",shape:event.sign>0?"arrowUp":"arrowDown",color:event.sign>0?"#69d6b7":"#ed9caa",text:/choch/.test(kind)?"CHoCH":/bos/.test(kind)?"BOS":/sweep/.test(kind)?"Sweep":kind==="failed_break"?t("Failed break","突破失败"):t("Retest","回踩")});});
      owner.markers=lib.createSeriesMarkers(candles,[...unique.values()].sort((a,b)=>a.time.localeCompare(b.time)),{autoScale:false});
    }
    // Current snapshot overlays live only in a short right-hand strip. They
    // are not historical orders or reconstructed historical Action ranges.
    const bands=[];
    if(layers.zones){
      const hold=options.decision?.action==="hold";
      if(!options.decision?.backgroundOnly) {
        bands.push({range:landscape.opportunityRange,label:hold?t("Lower observation","下方观察区"):t("Entry candidate","建仓候选区"),color:"#48bb99"});
        bands.push({range:landscape.reduceRange,label:hold?t("Upper observation","上方观察区"):t("Reduce / exit area","减仓／退出区"),color:"#8ab5e6"});
        bands.push({price:landscape.invalidation,label:t("Invalidation","失效位"),color:"#e1b66b"},{price:landscape.hardInvalidation,label:t("Hard risk","硬风险"),color:"#e27985"});
        if(options.decision?.action==="short_sell")bands.push({range:landscape.shortEntryRange,label:t("Short entry","开空区"),color:"#e79fbe"},{price:landscape.shortInvalidation,label:t("Short invalidation","开空失效位"),color:"#e27985"});
      }
    }
    if(layers.fib){const fib=options.features.fibonacci_structure?.[options.horizon];if(fib?.status==="available")Object.values(fib.retracement_levels || {}).filter(level=>level.valid_for_display).forEach(level=>bands.push({price:level.price,label:`Fib ${level.label}`,color:"#bea2ee"}));}
    if(layers.history){const p=frame.price_position || {};bands.push({price:p.high_52w,label:"52W High",color:"#a1a9b6"},{price:p.low_52w,label:"52W Low",color:"#a1a9b6"},{price:p.all_time_high,label:t("Loaded high","已载历史高点"),color:"#b3a28d"});}
    if(layers.fvg)(frame.fvg?.gaps || []).filter(g=>!['invalidated','filled'].includes(g.status)).forEach(g=>bands.push({range:g,label:t("FVG · shadow","FVG · 影子"),color:"#b9a2de"}));
    if(finite(options.quotePrice))bands.push({price:options.quotePrice,label:t("Quote","当前报价"),color:"#d4dfeb"});
    const repaint=()=>{
      if(owner.disposed || owner.chart!==chart)return;
      const height=chart.panes()[0].getHeight(),lastX=chart.timeScale().timeToCoordinate(model.candles.at(-1).time);
      // Panning into history must not attach today's zones to old candles.
      if(lastX===null || lastX<65 || lastX>canvas.clientWidth-50) {overlays.replaceChildren();return;}
      overlays.style.right=`${Math.max(67,canvas.clientWidth-lastX-24)}px`;
      const placed=bands.map(b=>{
        const lo=b.range?.low ?? b.price,hi=b.range?.high ?? b.price;
        if(!finite(lo)||!finite(hi))return null;
        const y1=candles.priceToCoordinate(hi),y2=candles.priceToCoordinate(lo);
        if(y1===null||y2===null||y2<0||y1>height)return null;
        const top=Math.max(0,y1),bottom=Math.min(height,y2),isRange=Boolean(b.range);
        return {...b,lo,hi,top,bottom,isRange,labelY:Math.max(2,Math.min(height-15,top+(isRange?2:-16)))};
      }).filter(Boolean).sort((a,b)=>a.labelY-b.labelY);
      const gap=14;
      for(let i=1;i<placed.length;i++)placed[i].labelY=Math.max(placed[i].labelY,placed[i-1].labelY+gap);
      if(placed.length && placed.at(-1).labelY>height-15){placed.at(-1).labelY=height-15;for(let i=placed.length-2;i>=0;i--)placed[i].labelY=Math.min(placed[i].labelY,placed[i+1].labelY-gap);}
      overlays.innerHTML=placed.map(b=>`<div class="chart-zone${b.isRange?"":" chart-level"}" style="top:${b.top}px;height:${Math.max(1,b.bottom-b.top)}px;--zone-color:${b.color}"><i class="chart-label-leader" style="top:${Math.min(0,b.labelY-b.top+7)}px;height:${Math.abs(b.labelY-b.top+7)}px"></i><span style="top:${b.labelY-b.top}px">${escape(b.label)} ${number(b.lo)}${b.isRange?`–${number(b.hi)}`:""}</span></div>`).join("");
    };
    chart.subscribeCrosshairMove(param=>{if(param.time){const i=model.candles.findIndex(b=>b.time===param.time);if(i>=0)readout(i);}else readout(model.candles.length-1);repaint();});
    chart.timeScale().subscribeVisibleLogicalRangeChange(repaint);
    // Redraw on price-scale gestures too, without a permanent animation loop.
    canvas.onpointerup=repaint;canvas.onwheel=()=>requestAnimationFrame(repaint);
    owner.observer=new ResizeObserver(()=>{if(!owner.disposed && owner.chart===chart){chart.resize(Math.max(240,canvas.clientWidth),canvas.clientHeight);repaint();}});owner.observer.observe(canvas);
    if(previous)chart.timeScale().setVisibleLogicalRange(previous);else setRange(owner);
    repaint();
    const signal=options.decision?.signalAsOf || model.asOf;
    const fibMissing=layers.fib && options.features.fibonacci_structure?.[options.horizon]?.status!=="available";
    const oscillatorMissing=pref.oscillator!=="none" && !model.oscillator.some(line=>line.data.some(point=>finite(point.value)));
    q("[data-chart-context]").textContent=`${t("Completed bars","完成K线")} ${model.candles.length}/${model.totalBars} · ${t("Signal close","信号收盘")} ${signal?signal.slice(0,10):"—"} · ${t("Right-edge zones describe the current snapshot; structure begins at confirmation. Quote does not create a candle.","右侧区间仅对应当前快照；结构线从确认时点起画。报价不拼接K线。")}${options.features.data_quality?.price_basis_unverified?t(" · Historical price basis unverified."," · 历史价格调整口径未核验。"):""}${oscillatorMissing?t(" · Indicator history/input unavailable."," · 所选副图历史／必要数据不足。"):""}${!model.volumeAvailable?t(" · Volume indicators unavailable: see source status below."," · 量指标不可用：请查看下方来源状态。"):""}${fibMissing?t(" · Fibonacci unavailable/stale: no valid levels drawn."," · Fib缺失／波段较旧，未绘制有效回撤位。"):""}${model.sourceState!=="current"?t(" · Source missing/stale: use the data status below."," · 来源缺失／过期：以数据状态说明为准。"):""}`;
    q("[data-chart-table]").innerHTML=`<table><thead><tr>${[t("Date","日期"),t("Open","开"),t("High","高"),t("Low","低"),t("Close","收"),t("Volume","量")].map(v=>`<th>${v}</th>`).join("")}</tr></thead><tbody>${model.candles.slice(-10).map((bar,i)=>`<tr><td>${bar.time}</td>${[bar.open,bar.high,bar.low,bar.close].map(v=>`<td>${number(v)}</td>`).join("")}<td>${volume(model.volume[model.candles.length-Math.min(10,model.candles.length)+i]?.value)}</td></tr>`).join("")}</tbody></table>`;
  }
  root.TechnicalChart={markup,mount,destroy,debugState:()=>({active:active?.chart?1:0,created,removed,bars:active?.model?.candles.length || 0,series:active?.series?.length || 0})};
}(globalThis));
