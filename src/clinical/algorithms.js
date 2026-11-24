/**
 * RoundingOS — Interactive Clinical Decision Algorithms
 * 10 branching algorithms (hyponatremia, AKI, hyperkalemia, CAP, AFib/RVR,
 * pancreatitis, GI bleed, cUTI/pyelo, metabolic acidosis, pleural effusion).
 * Each step's choice rewrites the template's assessment, workup, plan and red flags
 * so the A&P matches the branch the patient is actually on.
 * Pure data + pure functions: no DOM, no storage.
 */

const ClinicalAlgorithms = (() => {
  const DEFS = {
  "GBHOSPHYPONATREMIA": {
    "title": "Hyponatremia 3-Step Diagnostic & Management Algorithm",
    "subtitle": "Matches Posm -> Uosm -> UNa workup + Severity & ODS safety ceiling",
    "steps": [
      {
        "id": "posm",
        "label": "STEP 1: Serum Osmolality (Posm 275–290)",
        "type": "single",
        "default": "low",
        "options": [
          {
            "id": "low",
            "label": "Low / True (<275)"
          },
          {
            "id": "pseudo",
            "label": "Normal / Pseudo (275–290)"
          },
          {
            "id": "high",
            "label": "High (>290)"
          }
        ]
      },
      {
        "id": "uosm",
        "label": "STEP 2: Urine Osmolality (Uosm)",
        "type": "single",
        "default": "high",
        "showIf": {
          "posm": "low"
        },
        "options": [
          {
            "id": "low",
            "label": "Uosm <100 (↓ADH)"
          },
          {
            "id": "high",
            "label": "Uosm >100 (↑ADH)"
          }
        ]
      },
      {
        "id": "una",
        "label": "STEP 3: Urine Sodium (UNa) & Volume Status",
        "type": "single",
        "default": "euvol",
        "showIf": {
          "posm": "low",
          "uosm": "high"
        },
        "options": [
          {
            "id": "hypovol",
            "label": "UNa <30 — Hypovolemic"
          },
          {
            "id": "hypervol",
            "label": "UNa <30 — Hypervolemic (HF / Cirrhosis)"
          },
          {
            "id": "euvol",
            "label": "UNa >30 — Euvolemic (SIADH / AI / Thyroid)"
          }
        ]
      },
      {
        "id": "euvol_cause",
        "label": "Euvolemic Sub-Branch (UNa >30)",
        "type": "single",
        "default": "siadh",
        "showIf": {
          "posm": "low",
          "uosm": "high",
          "una": "euvol"
        },
        "options": [
          {
            "id": "siadh",
            "label": "SIADH"
          },
          {
            "id": "ai",
            "label": "Adrenal Insufficiency (AI)"
          },
          {
            "id": "thyroid",
            "label": "Hypothyroidism"
          },
          {
            "id": "thiazide",
            "label": "Thiazide-Induced"
          }
        ]
      },
      {
        "id": "mods",
        "label": "Severity & Safety Modifiers",
        "type": "multi",
        "default": [],
        "showIf": {
          "posm": "low"
        },
        "options": [
          {
            "id": "severe",
            "label": "Severe symptoms (seizure, AMS, vomiting)"
          },
          {
            "id": "ods",
            "label": "High ODS risk (Na <=105, AUD, cirrhosis, malnutrition, hypoK)"
          }
        ]
      }
    ]
  },
  "GBHOSPAKI": {
    "title": "AKI Diagnostic & KDIGO Management Algorithm",
    "subtitle": "Tailors workup & fluids by Prerenal / Intrinsic / Postrenal etiology",
    "steps": [
      {
        "id": "mech",
        "label": "STEP 1: Suspected Mechanism",
        "type": "single",
        "default": "prerenal",
        "options": [
          {
            "id": "prerenal",
            "label": "Prerenal (Hypovolemia / Cardiorenal / HRS)"
          },
          {
            "id": "atn",
            "label": "Intrinsic — ATN"
          },
          {
            "id": "ain",
            "label": "Intrinsic — AIN / GN"
          },
          {
            "id": "postrenal",
            "label": "Postrenal (Obstruction)"
          }
        ]
      },
      {
        "id": "mods",
        "label": "STEP 2: Complications / Triggers",
        "type": "multi",
        "default": [],
        "options": [
          {
            "id": "overload",
            "label": "Volume overloaded"
          },
          {
            "id": "aeiou",
            "label": "Urgent HD indication (AEIOU)"
          }
        ]
      }
    ]
  },
  "GBHOSPHYPERK": {
    "title": "Hyperkalemia Emergent Management Algorithm",
    "subtitle": "Auto-adjusts membrane stabilization, shifting, and elimination by ECG & UOP",
    "steps": [
      {
        "id": "ecg",
        "label": "STEP 1: ECG Changes (Peaked T, wide QRS, PR prolongation)",
        "type": "single",
        "default": "yes",
        "options": [
          {
            "id": "yes",
            "label": "ECG Changes / K >=6.5 (Emergent)"
          },
          {
            "id": "no",
            "label": "No ECG Changes (K 5.5–6.4)"
          }
        ]
      },
      {
        "id": "uop",
        "label": "STEP 2: Urine Output / Renal Status",
        "type": "single",
        "default": "making",
        "options": [
          {
            "id": "making",
            "label": "Making Urine"
          },
          {
            "id": "anuric",
            "label": "Oliguric / Anuric / ESRD"
          }
        ]
      }
    ]
  },
  "GBHOSPPNA": {
    "title": "CAP Empiric Regimen & Severity Algorithm (IDSA/ATS + CAPE COD)",
    "subtitle": "Selects targeted inpatient antibiotics & severe CAP steroids",
    "steps": [
      {
        "id": "sev",
        "label": "STEP 1: Severity",
        "type": "single",
        "default": "floor",
        "options": [
          {
            "id": "floor",
            "label": "Non-Severe Inpatient (Floor)"
          },
          {
            "id": "severe",
            "label": "Severe CAP (ICU / HFNC / Pressors)"
          }
        ]
      },
      {
        "id": "mdro",
        "label": "STEP 2: MDRO / Viral Modifiers",
        "type": "multi",
        "default": [],
        "options": [
          {
            "id": "mrsa",
            "label": "MRSA risk (prior MRSA / recent IV abx)"
          },
          {
            "id": "psa",
            "label": "Pseudomonas risk"
          },
          {
            "id": "flu",
            "label": "Influenza positive / suspected"
          }
        ]
      }
    ]
  },
  "GBHOSPAFIB": {
    "title": "AFib with RVR Algorithm (2023 ACC/AHA)",
    "subtitle": "Branches by hemodynamic stability, LVEF, and anticoagulation threshold",
    "steps": [
      {
        "id": "stab",
        "label": "STEP 1: Hemodynamic Stability",
        "type": "single",
        "default": "stable",
        "options": [
          {
            "id": "stable",
            "label": "Stable"
          },
          {
            "id": "unstable",
            "label": "Unstable (Hypotension / Ischemia / Pulm Edema)"
          }
        ]
      },
      {
        "id": "ef",
        "label": "STEP 2: Ventricular Function (LVEF)",
        "type": "single",
        "default": "preserved",
        "showIf": {
          "stab": "stable"
        },
        "options": [
          {
            "id": "preserved",
            "label": "EF Preserved (>=40%)"
          },
          {
            "id": "reduced",
            "label": "HFrEF (EF <40%) or Soft BP"
          }
        ]
      },
      {
        "id": "ac",
        "label": "STEP 3: Anticoagulation (CHA2DS2-VASc)",
        "type": "single",
        "default": "doac",
        "options": [
          {
            "id": "doac",
            "label": "Indicated (>=2 M / >=3 F) -> DOAC"
          },
          {
            "id": "hold",
            "label": "Contraindicated / Active Bleed"
          }
        ]
      }
    ]
  },
  "GBHOSPPANCREATITIS": {
    "title": "Acute Pancreatitis Algorithm (ACG 2024 / WATERFALL)",
    "subtitle": "Adjusts LR rate, biliary vs hyperTG management, and cholangitis escalation",
    "steps": [
      {
        "id": "etio",
        "label": "STEP 1: Suspected Etiology",
        "type": "single",
        "default": "biliary",
        "options": [
          {
            "id": "biliary",
            "label": "Gallstone / Biliary"
          },
          {
            "id": "etoh",
            "label": "Alcohol"
          },
          {
            "id": "tg",
            "label": "Hypertriglyceridemia (TG >1000)"
          }
        ]
      },
      {
        "id": "mods",
        "label": "STEP 2: Volume & Severity Modifiers",
        "type": "multi",
        "default": [],
        "options": [
          {
            "id": "hypovol",
            "label": "Hypovolemic (add 10 mL/kg LR bolus)"
          },
          {
            "id": "cholangitis",
            "label": "Concurrent Cholangitis (ERCP <24h)"
          }
        ]
      }
    ]
  },
  "GBHOSPGIB": {
    "title": "GI Bleeding Algorithm (Upper vs Lower & Cirrhosis)",
    "subtitle": "Branches variceal therapy, PPI, anticoagulation reversal, and EGD vs CTA",
    "steps": [
      {
        "id": "loc",
        "label": "STEP 1: Bleed Source",
        "type": "single",
        "default": "ugib",
        "options": [
          {
            "id": "ugib",
            "label": "Upper GI Bleed (Non-Variceal)"
          },
          {
            "id": "variceal",
            "label": "Upper GI Bleed — Cirrhosis / Variceal"
          },
          {
            "id": "lgib",
            "label": "Lower GI Bleed (Hematochezia)"
          }
        ]
      },
      {
        "id": "mods",
        "label": "STEP 2: Risk Modifiers",
        "type": "multi",
        "default": [],
        "options": [
          {
            "id": "anticoag",
            "label": "On Anticoagulant (Reversal needed)"
          },
          {
            "id": "unstable",
            "label": "Hemodynamically Unstable"
          }
        ]
      }
    ]
  },
  "GBHOSPUTIPYELO": {
    "title": "Complicated UTI / Pyelonephritis Algorithm (IDSA 2025 4-Step)",
    "subtitle": "Selects empiric agent by sepsis severity, ESBL risk, and obstruction",
    "steps": [
      {
        "id": "sev",
        "label": "STEP 1: Illness Severity & Resistance Risk",
        "type": "single",
        "default": "std",
        "options": [
          {
            "id": "std",
            "label": "Non-Septic, Low Resistance Risk"
          },
          {
            "id": "esbl",
            "label": "Prior ESBL / Recent Broad-Spectrum Abx"
          },
          {
            "id": "septic",
            "label": "Septic / Hemodynamically Unstable"
          }
        ]
      },
      {
        "id": "mods",
        "label": "STEP 2: Anatomic Modifiers",
        "type": "multi",
        "default": [],
        "options": [
          {
            "id": "foley",
            "label": "Indwelling Foley / CAUTI"
          },
          {
            "id": "obstruct",
            "label": "Suspected Obstruction / Stone"
          }
        ]
      }
    ]
  },
  "GBHOSPMETACIDOSIS": {
    "title": "Metabolic Acidosis Algorithm (AG vs Non-AG)",
    "subtitle": "Branches HAGMA vs NAGMA workup, Winter's formula, and bicarbonate threshold",
    "steps": [
      {
        "id": "gap",
        "label": "STEP 1: Albumin-Corrected Anion Gap",
        "type": "single",
        "default": "hagma",
        "options": [
          {
            "id": "hagma",
            "label": "High Anion Gap (HAGMA >12)"
          },
          {
            "id": "nagma",
            "label": "Normal Anion Gap (NAGMA <=12)"
          }
        ]
      },
      {
        "id": "mods",
        "label": "STEP 2: Severe Acidemia Modifier",
        "type": "multi",
        "default": [],
        "options": [
          {
            "id": "bicarb",
            "label": "pH <7.15–7.20 with AKI (BICAR-ICU bicarb)"
          },
          {
            "id": "osmgap",
            "label": "Suspected Toxic Alcohol (check Osm Gap)"
          }
        ]
      }
    ]
  },
  "GBHOSPPLEURALEFF": {
    "title": "Pleural Effusion Algorithm (Light's Criteria + BTS 2023)",
    "subtitle": "Branches transudate vs exudate and pH-led chest tube drainage",
    "steps": [
      {
        "id": "type",
        "label": "STEP 1: Light's Criteria Classification",
        "type": "single",
        "default": "exudate",
        "options": [
          {
            "id": "transudate",
            "label": "Transudate (HF / Cirrhosis / Nephrotic)"
          },
          {
            "id": "exudate",
            "label": "Exudate — Parapneumonic / Infection"
          },
          {
            "id": "malignant",
            "label": "Exudate — Suspected Malignant"
          }
        ]
      },
      {
        "id": "ph",
        "label": "STEP 2: Pleural Fluid pH (BTS 2023)",
        "type": "single",
        "default": "low",
        "showIf": {
          "type": "exudate"
        },
        "options": [
          {
            "id": "low",
            "label": "pH <=7.2 or Frank Pus (Drain)"
          },
          {
            "id": "mid",
            "label": "pH 7.2–7.4 (Check LDH >900 / Gluc <60)"
          },
          {
            "id": "high",
            "label": "pH >=7.4 (Low risk — Abx only)"
          }
        ]
      }
    ]
  }
};

  // Which algorithm (if any) drives this template: matched by pairKey first, then id.
  function keyFor(phrase) {
    if (!phrase) return null;
    if (phrase.pairKey && DEFS[phrase.pairKey]) return phrase.pairKey;
    if (DEFS[phrase.id]) return phrase.id;
    return null;
  }

  function defaults(algoKey) {
    const sel = {};
    (DEFS[algoKey]?.steps || []).forEach(s => {
      sel[s.id] = s.type === 'multi' ? [...(s.default || [])] : s.default;
    });
    return sel;
  }

  function isStepVisible(step, sel) {
    if (!step.showIf) return true;
    return Object.entries(step.showIf).every(([k, v]) => sel[k] === v);
  }

  // Stable signature of the branch path (only visible steps count), used to key checklist state.
  function signature(algoKey, sel) {
    return (DEFS[algoKey]?.steps || [])
      .filter(s => isStepVisible(s, sel))
      .map(s => s.id + '=' + (Array.isArray(sel[s.id]) ? [...sel[s.id]].sort().join('+') : sel[s.id]))
      .join('|');
  }

  // Returns {...baseModel, assessment, workup, plan, redFlags} tailored to the selected branch.
  function resolve(algoKey, sel, baseModel) {
        const hasMod = (m) => Array.isArray(sel.mods) && sel.mods.includes(m);

        if (algoKey === "GBHOSPHYPONATREMIA") {
          if (sel.posm === "high") {
            return {
              ...baseModel,
              assessment: "Hypertonic hyponatremia (Posm >290), Na ***, glucose/mannitol ***.",
              workup: [
                "Step 1 (Posm >290): Hypertonic/translocational hyponatremia — calculate corrected Na (+1.6-2.4 mEq/L per 100 mg/dL glucose >100)",
                "Check BMP, serum glucose, serum osm, review mannitol/contrast/IVIG exposure"
              ],
              plan: [
                "Treat underlying hyperglycemia (DKA/HHS/insulin) or stop osmotic agent — do NOT give hypertonic saline",
                "Trend BMP q4-6h as glucose/osmolality normalizes"
              ],
              redFlags: "Evaluate for DKA/HHS if glucose markedly elevated."
            };
          }
          if (sel.posm === "pseudo") {
            return {
              ...baseModel,
              assessment: "Pseudohyponatremia (normal Posm 275-290), Na ***, likely hyperproteinemia/hyperlipidemia.",
              workup: [
                "Step 1 (Normal Posm 275-290): Pseudohyponatremia — confirm true Na with direct ion-selective electrode (blood gas analyzer)",
                "Check fasting lipid panel (triglycerides), total protein/albumin, SPEP/SFLC if paraproteinemia suspected"
              ],
              plan: [
                "No sodium correction or fluid restriction required",
                "Manage underlying hypertriglyceridemia or paraproteinemia"
              ],
              redFlags: "Avoid unnecessary 3% NaCl or fluid restriction (causes iatrogenic hypernatremia)."
            };
          }
          // Low Posm (<275) — True hypotonic hyponatremia
          const ceil = hasMod("ods") ? "6 mEq/L per 24h (HIGH ODS RISK: Na <=105, AUD, cirrhosis, malnutrition, or hypoK)" : "8 mEq/L per 24h (goal +4-6 mEq/L/24h)";
          const severePlan = hasMod("severe") ? ["SEVERE SYMPTOMS: 3% NaCl 150 mL IV over 10 min (repeat up to x3 for goal +4-6 mEq/L); ICU level of care"] : [];

          if (sel.uosm === "low") {
            return {
              ...baseModel,
              assessment: "Hypotonic hyponatremia (Posm <275, Uosm <100 — suppressed ADH), Na ***, likely primary polydipsia or low solute intake.",
              workup: [
                "Step 1: Posm <275 (true hypotonic) -> Step 2: Uosm <100 mOsm/kg (appropriately dilute urine)",
                "Assess free water intake (primary polydipsia) vs poor solute intake (beer potomania, tea-and-toast diet)",
                "BMP q4-6h during correction; strict I/O and hourly UOP"
              ],
              plan: [
                ...severePlan,
                "Fluid restriction (<1-1.5 L/day) + restore oral dietary protein/solute intake",
                "Correction limit: " + ceil,
                "High risk of brisk aquaresis once solute restored: if UOP >100 mL/h or Na overcorrecting, give D5W +/- DDAVP 2 mcg IV"
              ],
              redFlags: "Rapid overcorrection (>6-8 mEq/L/24h) or brisk aquaresis -> recheck Na q2h, D5W + DDAVP clamp."
            };
          }
          // Uosm > 100 (↑ADH) -> Step 3 UNa
          if (sel.una === "hypovol") {
            return {
              ...baseModel,
              assessment: "Hypotonic hypovolemic hyponatremia (Posm <275, Uosm >100, UNa <30), Na ***.",
              workup: [
                "Step 1: Posm <275 -> Step 2: Uosm >100 (↑ADH) -> Step 3: UNa <30 mEq/L (↓ effective arterial volume; hypovolemic)",
                "Identify extrarenal losses (GI vomiting/diarrhea, third-spacing, prior diuretics); check orthostatics, BUN/Cr",
                "BMP q4-6h while correcting; strict I/O and UOP"
              ],
              plan: [
                ...severePlan,
                "Isotonic crystalloid (0.9% NaCl or LR) to restore euvolemia and suppress ADH",
                "Hold diuretics and offending meds; replete K (KCl also raises serum Na)",
                "Correction limit: " + ceil,
                "Watch closely for brisk aquaresis (UOP >100 mL/h) once volume restored -> recheck Na q2h, D5W +/- DDAVP 2 mcg IV if overcorrecting"
              ],
              redFlags: "Overcorrection after volume repletion is the #1 cause of ODS -> monitor UOP closely and clamp with DDAVP/D5W if needed."
            };
          }
          if (sel.una === "hypervol") {
            return {
              ...baseModel,
              assessment: "Hypotonic hypervolemic hyponatremia (Posm <275, Uosm >100, UNa <30), Na ***, secondary to HF/cirrhosis ***.",
              workup: [
                "Step 1: Posm <275 -> Step 2: Uosm >100 (↑ADH) -> Step 3: UNa <30 mEq/L (↓ effective arterial volume; hypervolemic)",
                "Assess JVP, edema, ascites, daily weight, BNP/LFTs; daily BMP (q6h if severe)"
              ],
              plan: [
                ...severePlan,
                "Fluid restriction 1-1.5 L/day and sodium restriction <2 g/day",
                "Loop diuretic (furosemide) to promote free water clearance and treat underlying HF/cirrhosis (avoid isotonic saline)",
                "Correction limit: " + ceil
              ],
              redFlags: "Severe symptoms -> 3% NaCl + loop diuretic in ICU; worsening renal function or refractory overload -> cardiology/hepatology."
            };
          }
          // UNa > 30 (Euvolemic)
          const subMap = {
            siadh: {
              asm: "Hypotonic euvolemic hyponatremia — SIADH (Posm <275, Uosm >100, UNa >30), Na ***.",
              w: [
                "Step 1: Posm <275 -> Step 2: Uosm >100 -> Step 3: UNa >30 mEq/L (euvolemic)",
                "Rule out SIADH mimics first: check AM cortisol (AI) and TSH (hypothyroidism); check uric acid (often <4 in SIADH)",
                "Evaluate SIADH triggers: meds (SSRIs, carbamazepine, PPIs), pulmonary (PNA/malignancy), CNS, pain/nausea"
              ],
              p: [
                ...severePlan,
                "Fluid restriction 1-1.5 L/day (avoid 0.9% NaCl if Uosm >300 — can worsen Na via desalination)",
                "Add oral solute if refractory: NaCl tabs 1-2 g TID +/- loop diuretic, or oral urea 15-30 g daily",
                "Stop offending SIADH meds; treat pain/nausea",
                "Correction limit: " + ceil
              ]
            },
            ai: {
              asm: "Hypotonic euvolemic hyponatremia — suspected adrenal insufficiency (Posm <275, Uosm >100, UNa >30), Na ***.",
              w: [
                "Step 1: Posm <275 -> Step 2: Uosm >100 -> Step 3: UNa >30 mEq/L (euvolemic)",
                "Check AM serum cortisol, ACTH, cosyntropin stimulation test (do not delay steroids if unstable), BMP (hyperK/hypoglycemia)"
              ],
              p: [
                ...severePlan,
                "Hydrocortisone replacement (100 mg IV if crisis/hypotensive, or physiologic stress dosing) -> rapidly suppresses ADH",
                "Correction limit: " + ceil,
                "Monitor UOP closely after steroids (high risk of brisk aquaresis/overcorrection -> D5W +/- DDAVP 2 mcg IV)"
              ]
            },
            thyroid: {
              asm: "Hypotonic euvolemic hyponatremia — hypothyroidism (Posm <275, Uosm >100, UNa >30), Na ***, TSH ***.",
              w: [
                "Step 1: Posm <275 -> Step 2: Uosm >100 -> Step 3: UNa >30 mEq/L (euvolemic)",
                "Check TSH, free T4, AM cortisol (rule out concurrent adrenal insufficiency before starting levothyroxine)"
              ],
              p: [
                ...severePlan,
                "Initiate/adjust levothyroxine (give hydrocortisone first if central/myxedema coma suspected)",
                "Fluid restriction 1-1.5 L/day; correction limit: " + ceil
              ]
            },
            thiazide: {
              asm: "Hypotonic hyponatremia — thiazide-induced (Posm <275, Uosm >100, UNa >30), Na ***.",
              w: [
                "Step 1: Posm <275 -> Step 2: Uosm >100 -> Step 3: UNa >30 (diuretic effect); check BMP (hypokalemia), uric acid"
              ],
              p: [
                ...severePlan,
                "Stop thiazide diuretic permanently and document intolerance",
                "Replete potassium aggressively (KCl raises serum Na); gentle isotonic fluid only if clinically hypovolemic",
                "Correction limit: " + ceil + "; monitor for brisk aquaresis once thiazide clears"
              ]
            }
          };
          const sub = subMap[sel.euvol_cause || "siadh"];
          return {
            ...baseModel,
            assessment: sub.asm,
            workup: sub.w,
            plan: sub.p,
            redFlags: "Severe neuro symptoms -> 3% NaCl + ICU; overcorrection or UOP >100 mL/h -> Na q2h + D5W/DDAVP."
          };
        }

        if (algoKey === "GBHOSPAKI") {
          const mechMap = {
            prerenal: {
              asm: "AKI — prerenal etiology, Cr *** (baseline ***), KDIGO stage ***.",
              w: ["Assess volume status, orthostatics, UOP, JVP; daily BMP, strict I/O, daily weight", "UA microscopy (bland/hyaline casts), FENa (<1%) or FEUrea (<35% if on diuretics)"],
              p: ["Hold NSAIDs, ACEi/ARB, diuretics, SGLT2i, metformin; renally dose all meds", hasMod("overload") ? "Volume overloaded (cardiorenal/HRS): avoid fluids; IV loop diuretic or albumin challenge if cirrhosis" : "Isotonic crystalloid (LR 500-1000 mL bolus), reassess UOP and perfusion"]
            },
            atn: {
              asm: "AKI — intrinsic ATN (ischemic/nephrotoxic ***), Cr *** (baseline ***), KDIGO stage ***.",
              w: ["UA with microscopy (muddy brown granular casts), urine Na/Cr (FENa >2%), CK if rhabdo concern", "Daily BMP, Mg, Phos, strict I/O, daily weight"],
              p: ["Stop all nephrotoxins (vanc, aminoglycosides, NSAIDs, contrast); renally dose meds", "Maintain euvolemia (avoid over-resuscitation if oliguric); manage K and acidosis", "Supportive care; recovery typically 1-3 weeks"]
            },
            ain: {
              asm: "AKI — suspected AIN / glomerulonephritis, Cr *** (baseline ***), KDIGO stage ***.",
              w: ["Medication review (PPIs, beta-lactams, NSAIDs, ICIs); UA microscopy (WBC casts = AIN; dysmorphic RBCs/RBC casts = GN), urine protein/Cr", "If GN suspected: C3/C4, ANA, ANCA, anti-GBM, Hep B/C, HIV, SPEP/SFLC; renal US"],
              p: ["Stop offending agent immediately; renally dose all meds", "Nephrology consult for biopsy consideration and empiric steroids if AIN/RPGN"]
            },
            postrenal: {
              asm: "AKI — postrenal / obstructive uropathy, Cr *** (baseline ***), PVR *** mL.",
              w: ["STAT bladder scan and renal ultrasound (hydronephrosis); daily BMP, strict I/O"],
              p: ["Immediate bladder decompression (Foley catheter) if retention; urology/IR consult for ureteral stent or PCN if upper tract obstruction", "Monitor closely for post-obstructive diuresis (UOP >200 mL/h x2h -> replace 50% with 0.45% NaCl, check BMP q6h)"]
            }
          };
          const m = mechMap[sel.mech || "prerenal"];
          const extraP = hasMod("aeiou") ? ["URGENT HD INDICATION (AEIOU): STAT nephrology consult for renal replacement therapy; place dialysis access"] : [];
          return { ...baseModel, assessment: m.asm, workup: m.w, plan: [...m.p, ...extraP] };
        }

        if (algoKey === "GBHOSPHYPERK") {
          const emergent = sel.ecg === "yes";
          const anuric = sel.uop === "anuric";
          return {
            ...baseModel,
            assessment: `Hyperkalemia, K *** (${emergent ? "ECG changes / emergent" : "no ECG changes"}), ${anuric ? "oliguric/anuric" : "making urine"}.`,
            workup: [
              "STAT 12-lead ECG (repeat after calcium if abnormal); repeat non-hemolyzed BMP + VBG + glucose",
              "Continuous telemetry; repeat K 2h post-treatment; fingerstick glucose q1h x4h after insulin"
            ],
            plan: [
              ...(emergent ? ["MEMBRANE STABILIZATION: Calcium gluconate 1 g IV over 5-10 min (repeat q5min until ECG normalizes)"] : ["No ECG changes: calcium gluconate not required unless ECG evolves"]),
              "SHIFT: Regular insulin 5 units IV + D50 25 g IV (skip D50 if glucose >250) + albuterol 10-20 mg neb",
              anuric ? "ELIMINATE (anuric/ESRD): Sodium zirconium cyclosilicate (Lokelma) 10 g PO TID + URGENT nephrology for hemodialysis" : "ELIMINATE: Furosemide 40-80 mg IV + sodium zirconium cyclosilicate (Lokelma) 10 g PO TID",
              "Stop ACEi/ARB/MRA, NSAIDs, TMP-SMX, K supplements; low-K diet"
            ],
            redFlags: "Refractory K >6.5, worsening ECG changes, or anuria -> emergent hemodialysis / ICU."
          };
        }

        if (algoKey === "GBHOSPPNA") {
          const sev = sel.sev === "severe";
          const mrsa = hasMod("mrsa");
          const psa = hasMod("psa");
          const flu = hasMod("flu");
          const abx = (mrsa || psa)
            ? `Broad-spectrum CAP: ${psa ? "cefepime 2 g IV q8h" : "ceftriaxone 1-2 g IV daily"} + azithromycin 500 mg daily${mrsa ? " + vancomycin IV (check MRSA nares to de-escalate)" : ""}`
            : "Standard inpatient CAP: ceftriaxone 1-2 g IV daily + azithromycin 500 mg daily (or doxycycline 100 mg BID)";
          return {
            ...baseModel,
            assessment: `${sev ? "Severe CAP" : "Community-acquired pneumonia"}, CURB-65 ***, SpO2 *** on ***.`,
            workup: [
              "CXR, CBC, BMP, procalcitonin, respiratory viral PCR (Flu/COVID/RSV)",
              ...(sev || mrsa || psa ? ["Blood cultures x2, sputum culture, MRSA nares, urine Legionella & pneumococcal Ag"] : ["Blood/sputum cultures not required for routine non-severe CAP without MDRO risk"])
            ],
            plan: [
              abx,
              ...(sev ? ["Severe CAP steroids (CAPE COD): hydrocortisone 200 mg/day IV (avoid if influenza or Aspergillus risk)"] : []),
              ...(flu ? ["Influenza coverage: oseltamivir 75 mg PO BID x5 days"] : []),
              "O2 to SpO2 92-96%; early mobility; IV-to-PO switch once afebrile/stable (total 5 days if clinically stable)"
            ],
            redFlags: sev ? "ICU level of care; watch for septic shock, ARDS, or empyema." : "Rising O2 requirement, hypotension, or multilobar progression -> escalate to ICU."
          };
        }

        if (algoKey === "GBHOSPAFIB") {
          if (sel.stab === "unstable") {
            return {
              ...baseModel,
              assessment: "UNSTABLE AFib with RVR, HR ***, BP *** (hypotension/ischemia/pulmonary edema).",
              workup: ["STAT 12-lead ECG, defib pads on, BMP/Mg/troponin"],
              plan: [
                "IMMEDIATE synchronized cardioversion 120-200 J biphasic (sedation if time permits)",
                "Post-cardioversion: replete K >4, Mg >2; anticoagulate per onset/CHA2DS2-VASc; cardiology consult"
              ],
              redFlags: "Recurrent unstable AF or shock -> ICU, amiodarone infusion, cardiology."
            };
          }
          const reduced = sel.ef === "reduced";
          return {
            ...baseModel,
            assessment: `AFib with RVR, HR ***, ${reduced ? "HFrEF / soft BP" : "EF preserved"}, CHA2DS2-VASc ***.`,
            workup: ["12-lead ECG, continuous telemetry, BMP, Mg, TSH, hs-troponin, TTE if none recent", "Identify reversible triggers (sepsis, hypovolemia, PE, alcohol, pain, held meds)"],
            plan: [
              "Treat underlying trigger; replete K >4.0, Mg >2.0",
              reduced
                ? "Rate control (HFrEF/soft BP): avoid non-DHP CCB; gentle metoprolol if euvolemic, or amiodarone 150 mg IV over 10 min then infusion / digoxin adjunct (goal HR <110)"
                : "Rate control (EF preserved, goal HR <110): metoprolol 5 mg IV q5min x3 then PO, OR diltiazem 10-20 mg IV then 5-15 mg/h infusion",
              sel.ac === "doac"
                ? "Anticoagulation (2023 ACC/AHA): start DOAC (apixaban 5 mg BID; renally dose as needed)"
                : "Anticoagulation held due to bleed risk/contraindication — document reason and reassess before discharge"
            ],
            redFlags: "Pre-excitation (WPW): avoid all AV nodal blockers (use procainamide/cardioversion). Hemodynamic instability -> cardiovert."
          };
        }

        if (algoKey === "GBHOSPPANCREATITIS") {
          const etioPlan = sel.etio === "biliary"
            ? "Biliary pancreatitis: RUQ US; plan index-admission cholecystectomy for mild disease (ERCP ONLY if cholangitis/persistent CBD obstruction)"
            : sel.etio === "tg"
              ? "Hypertriglyceridemia (TG >1000): regular insulin infusion 0.1 U/kg/h + D5W until TG <500; check BG q1h and BMP q4h; start fibrate at discharge"
              : "Alcohol-related pancreatitis: CIWA-Ar monitoring, thiamine 500 mg IV TID, folate, addiction counseling";
          return {
            ...baseModel,
            assessment: `Acute pancreatitis (${({ biliary: "gallstone/biliary", etoh: "alcohol-related", tg: "hypertriglyceridemia" })[sel.etio] || "etiology ***"}), BISAP ***, hospital day ***.`,
            workup: ["Lipase (do not trend), CBC, BMP, Ca, LFTs, triglycerides, RUQ ultrasound; CT only if diagnosis unclear or no improvement at 48-72h", "Monitor BUN, Hct, UOP, and volume status q6h"],
            plan: [
              `ACG 2024 / WATERFALL fluids: Lactated Ringer's 1.5 mL/kg/h${hasMod("hypovol") ? " + 10 mL/kg bolus (hypovolemic)" : ""}; reassess q6h, avoid aggressive >=3 mL/kg/h overload`,
              "Early oral low-fat solid diet within 24-48h as tolerated (no need for stepwise clear liquids)",
              "Multimodal pain control (IV hydromorphone PRN) + antiemetics; NO prophylactic antibiotics",
              etioPlan,
              ...(hasMod("cholangitis") ? ["CONCURRENT CHOLANGITIS: IV ceftriaxone + metronidazole (or pip-tazo) + urgent GI consult for ERCP within 24h"] : [])
            ],
            redFlags: "Persistent organ failure, rising BUN/Hct, infected necrosis, or hemodynamic instability -> ICU/GI/surgery."
          };
        }

        if (algoKey === "GBHOSPGIB") {
          const isVar = sel.loc === "variceal";
          const isLgib = sel.loc === "lgib";
          return {
            ...baseModel,
            assessment: `${isVar ? "Variceal/cirrhotic UGIB" : isLgib ? "Lower GI bleed (hematochezia)" : "Non-variceal Upper GI bleed"}, Hgb ***, Glasgow-Blatchford ***.`,
            workup: ["2 large-bore IVs, CBC q6h, BMP (BUN/Cr), coags, LFTs, type and cross 2 units", isLgib ? "Consider NG/EGD first if brisk hematochezia with instability (rules out brisk UGIB); CTA abd/pelvis if unstable" : "GI consult for urgent EGD within 24h (within 12h if variceal)"],
            plan: [
              "Restrictive transfusion: PRBC for Hgb <7 (<8 if active CAD)",
              ...(isLgib ? ["NPO, bowel prep for colonoscopy once hemodynamically stable (or CTA -> IR embolization if unstable)"] : ["Pantoprazole 80 mg IV bolus then 40 mg IV BID; NPO for EGD"]),
              ...(isVar ? ["Cirrhosis/variceal bundle: octreotide 50 mcg IV bolus then 50 mcg/h + ceftriaxone 1 g IV daily x7d; EGD within 12h"] : []),
              ...(hasMod("anticoag") ? ["Anticoagulation reversal: hold antithrombotics; 4F-PCC + vitamin K for warfarin, 4F-PCC/andexanet for Xa inhibitor if life-threatening bleed"] : ["Hold NSAIDs/antiplatelets (weigh stent risk)"]),
              ...(hasMod("unstable") ? ["HEMODYNAMICALLY UNSTABLE: ICU transfer, massive transfusion protocol if needed, urgent GI/IR"] : [])
            ],
            redFlags: "Ongoing hematemesis, SBP <90, HR >100, or refractory bleed -> ICU, urgent EGD/CTA/IR."
          };
        }

        if (algoKey === "GBHOSPUTIPYELO") {
          const abx = sel.sev === "septic"
            ? "Septic cUTI (IDSA 2025): cefepime 2 g IV q8h or meropenem 1 g IV q8h (per local antibiogram/ESBL risk) + LR resuscitation"
            : sel.sev === "esbl"
              ? "ESBL/MDRO risk cUTI (IDSA 2025): ertapenem 1 g IV daily (or meropenem if Pseudomonas risk)"
              : "Non-septic cUTI/pyelo (IDSA 2025): ceftriaxone 1 g IV daily; narrow to PO once afebrile 24-48h";
          return {
            ...baseModel,
            assessment: `Complicated UTI / pyelonephritis (${({ std: "non-septic, low resistance risk", esbl: "ESBL/MDRO risk", septic: "septic" })[sel.sev] || "severity ***"}), prior cultures ***.`,
            workup: [
              "UA with microscopy, urine culture (from freshly replaced catheter if indwelling), blood cultures x2 if febrile/septic",
              "Review prior 12-month urine cultures and local antibiogram (IDSA 2025 4-step approach)",
              ...(hasMod("obstruct") ? ["STAT renal US or non-contrast CT to rule out obstructing stone/hydronephrosis"] : ["Renal US/CT if no improvement at 48-72h"])
            ],
            plan: [
              abx,
              ...(hasMod("foley") ? ["Remove or replace indwelling Foley catheter (send culture from new catheter)"] : []),
              ...(hasMod("obstruct") ? ["OBSTRUCTION + INFECTION: URGENT urology/IR consult for ureteral stent or percutaneous nephrostomy"] : []),
              "Total duration: 7 days (fluoroquinolone/TMP-SMX) or 7-10 days (beta-lactam) once source controlled"
            ],
            redFlags: "Obstructed infected kidney = urologic emergency. Persistent fever >72h -> image for abscess."
          };
        }

        if (algoKey === "GBHOSPMETACIDOSIS") {
          const isHagma = sel.gap === "hagma";
          return {
            ...baseModel,
            assessment: `${isHagma ? "High anion gap metabolic acidosis (HAGMA)" : "Normal anion gap metabolic acidosis (NAGMA)"}, pH ***, HCO3 ***, AG ***.`,
            workup: [
              "VBG/ABG, BMP, albumin (correct AG +2.5 per 1 g/dL albumin <4); check Winter's formula: pCO2 = 1.5(HCO3) + 8 (+/-2)",
              ...(isHagma ? ["HAGMA workup (GOLDMARK): lactate, BHB, BUN/Cr, salicylate/acetaminophen, delta-delta ratio"] : ["NAGMA workup: urine anion gap (negative = GI diarrhea loss; positive = RTA), urine pH, serum K"]),
              ...(hasMod("osmgap") ? ["Check measured vs calculated serum osmolality (osm gap >10 -> methanol/ethylene glycol)"] : [])
            ],
            plan: [
              isHagma ? "Treat primary HAGMA cause (sepsis/lactate, DKA insulin, uremia/HD, toxin)" : "Treat primary NAGMA cause (GI losses/isotonic fluids or RTA alkali therapy)",
              ...(hasMod("bicarb") ? ["Severe acidemia (pH <7.15-7.20 + AKI, BICAR-ICU): IV sodium bicarbonate infusion targeting pH >=7.30; monitor Ca and volume"] : ["Avoid routine sodium bicarbonate unless pH <7.15-7.20 with AKI"]),
              ...(hasMod("osmgap") ? ["Suspected toxic alcohol: fomepizole 15 mg/kg IV load + toxicology/nephrology for emergent HD"] : []),
              "Repeat BMP/VBG q4-6h"
            ],
            redFlags: "pH <7.1, rising lactate, toxic alcohol, or respiratory fatigue -> ICU/nephrology."
          };
        }

        if (algoKey === "GBHOSPPLEURALEFF") {
          if (sel.type === "transudate") {
            return {
              ...baseModel,
              assessment: "Transudative pleural effusion (Light's criteria negative), side ***, suspected HF/cirrhosis ***.",
              workup: ["Confirm bilateral/clinical HF or cirrhosis; BNP, BMP, LFTs, albumin; US if asymmetric"],
              plan: ["Treat underlying systemic cause (IV diuresis for HF; Na restriction/diuretics for hepatic hydrothorax)", "Therapeutic thoracentesis only for refractory dyspnea (avoid chest tube in hepatic hydrothorax)"],
              redFlags: "Asymmetric effusion, fever, or chest pain -> diagnostic tap to exclude occult exudate/infection."
            };
          }
          if (sel.type === "malignant") {
            return {
              ...baseModel,
              assessment: "Suspected malignant exudative pleural effusion, side ***.",
              workup: ["US-guided thoracentesis: cell count, protein, LDH, glucose, cytology (>=50 mL fluid), CT chest with contrast"],
              plan: ["Therapeutic drainage for symptom relief (stop if chest discomfort/cough — trapped lung risk)", "Pulmonology/IP consult for tunneled indwelling pleural catheter (IPC) or pleurodesis; oncology follow-up"],
              redFlags: "Rapid re-accumulation, mediastinal shift, or trapped lung -> IP/thoracic surgery."
            };
          }
          const phPlan = sel.ph === "low"
            ? "BTS 2023 HIGH RISK (pH <=7.2 or frank pus): insert small-bore chest tube (12-14 Fr) under US + empiric IV antibiotics covering anaerobes (amp-sulbactam or ceftriaxone + metronidazole); consider tPA/DNase if loculated"
            : sel.ph === "mid"
              ? "BTS 2023 INTERMEDIATE RISK (pH 7.2-7.4): check LDH >900 IU/L, glucose <60 mg/dL, CT pleural enhancement/septations -> low threshold for chest tube drainage + IV antibiotics"
              : "BTS 2023 LOW RISK (pH >=7.4): uncomplicated parapneumonic effusion — treat underlying pneumonia with antibiotics, no immediate chest drain";
          return {
            ...baseModel,
            assessment: `Exudative parapneumonic pleural effusion (${({ low: "pH <=7.2 or frank pus", mid: "pH 7.2-7.4", high: "pH >=7.4" })[sel.ph] || "pleural pH ***"}), side ***.`,
            workup: ["Bedside US (assess septations), diagnostic tap: pH (blood gas syringe), LDH, protein, glucose, cell count, Gram stain/culture in blood culture bottles + paired serum protein/LDH"],
            plan: [phPlan, "Pulmonology/IP consult if loculated or failing to drain; repeat imaging after drainage"],
            redFlags: "Frank empyema, sepsis, or failed drainage -> IP/thoracic surgery for intrapleural fibrinolytics or VATS."
          };
        }

        return baseModel;
  }

  return { DEFS, keyFor, defaults, isStepVisible, signature, resolve };
})();
