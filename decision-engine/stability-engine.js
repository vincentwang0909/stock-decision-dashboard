(function createStabilityEngine(root) {
  "use strict";
  const engine=root.DecisionEngine || (root.DecisionEngine={});
  // Completed-bar persistence is reproducible after restart. No previous action or range can override a current gate.
  function evaluate({candidateAction,actionFamily,materialChangeReasons=[],profile={},technical={}}={}) {
    const base=technical.signalPersistence?.score ?? engine.config.stability.noHistory.unavailable;
    const modifier=technical.horizon==="weekly"?profile.effectiveModifiers?.weeklyStability || 1:1;
    return {finalAction:candidateAction,actionFamily,heldPrevious:false,material:Boolean(materialChangeReasons.length),materialChangeReasons,score:Math.round(Math.max(0,Math.min(100,base*modifier))),persistence:technical.signalPersistence || null,source:"completed_bar_persistence"};
  }
  engine.stability=Object.freeze({evaluate,clear:()=>{}});
}(globalThis));
